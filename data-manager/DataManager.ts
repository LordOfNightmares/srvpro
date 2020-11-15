import moment from "moment";
import bunyan from "bunyan";
import {Connection, ConnectionOptions, createConnection, EntityManager} from "typeorm";
import {CloudReplay} from "./entities/CloudReplay";
import {CloudReplayPlayer} from "./entities/CloudReplayPlayer";
import {Ban} from "./entities/Ban";
import {RandomDuelBan} from "./entities/RandomDuelBan";
import _ from "underscore";
import {DuelLog} from "./entities/DuelLog";
import {Deck} from "./DeckEncoder";
import {DuelLogPlayer} from "./entities/DuelLogPlayer";
import {User} from "./entities/User";
import {VipKey} from "./entities/VipKey";
import {UserDialog} from "./entities/UserDialog";

interface BasePlayerInfo {
	name: string;
	pos: number
}

export interface CloudReplayPlayerInfo extends BasePlayerInfo {
	key: string;
}

export interface DuelLogPlayerInfo extends BasePlayerInfo {
	realName: string;
	startDeckBuffer: Buffer;
	deck: Deck;
	isFirst: boolean;
	winner: boolean;
	ip: string;
	score: number;
	lp: number;
	cardCount: number;
}


export class DataManager {
	config: ConnectionOptions;
	ready: boolean;
	db: Connection;
	log: bunyan;
	constructor(config: ConnectionOptions, log: bunyan) {
		this.config = config;
		this.ready = false;
		this.log = log;
	}
	private async transaction(fun: (mdb: EntityManager) => Promise<boolean>) {
		const runner = await this.db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		let result = false;
		try {
			result = await fun(runner.manager);
		} catch(e) {
			result = false;
			this.log.warn(`Failed running transaction: ${e.toString()}`)
		}
		if(result) {
			await runner.commitTransaction();
		} else {
			await runner.rollbackTransaction();
		}
	}
	async init() {
		this.db = await createConnection({
			type: "mysql",
			synchronize: true,
			entities: ["./data-manager/entities/*.js"],
			...this.config
		});
		this.ready = true;
	}
	async getCloudReplaysFromKey(key: string) {
		try {
			const replays = await this.db.createQueryBuilder(CloudReplay, "replay")
				.where("exists (select id from cloud_replay_player where cloud_replay_player.cloudReplayId = replay.id and cloud_replay_player.key = :key)", { key })
				.orderBy("replay.date", "DESC")
				.limit(10)
				.leftJoinAndSelect("replay.players", "player")
				.getMany();
			return replays;
		} catch (e) {
			this.log.warn(`Failed to load replay of ${key}: ${e.toString()}`);
			return [];
		}

	}

	async getCloudReplayFromId(id: number) {
		try {
			return await this.db.getRepository(CloudReplay).findOne(id, { relations: ["players"] });
		} catch (e) {
			this.log.warn(`Failed to load replay R#${id}: ${e.toString()}`);
			return null;
		}
	}

	async getRandomCloudReplay() {
		try {
			const [minQuery, maxQuery] = await Promise.all(["min", "max"].map(minOrMax => this.db.createQueryBuilder()
				.select(`${minOrMax}(id)`, "value")
				.from(CloudReplay, "replay")
				.getRawOne()
			));
			if(!minQuery || maxQuery) {
				return null;
			}
			const targetId = Math.floor((maxQuery.value - minQuery.value) * Math.random()) + minQuery.value;
			return await this.db.createQueryBuilder(CloudReplay, "replay")
				.where("replay.id >= :targetId", {targetId})
				.orderBy("replay.id", "ASC")
				.limit(4) //there may be 4 players
				.leftJoinAndSelect("replay.players", "player")
				.getOne();
		} catch (e) {
			this.log.warn(`Failed to load random replay: ${e.toString()}`);
			return null;
		}
	}

	async saveCloudReplay(id: number, buffer: Buffer, playerInfos: CloudReplayPlayerInfo[]) {
		const replay = new CloudReplay();
		replay.id = id;
		replay.fromBuffer(buffer);
		replay.date = moment().toDate();
		const players = playerInfos.map(p => {
			const player = CloudReplayPlayer.fromPlayerInfo(p);
			return player;
		});
		await this.transaction(async (mdb) => {
			try {
				const nreplay = await mdb.save(replay);
				for (let player of players) {
					player.cloudReplay = nreplay;
				}
				await mdb.save(players);
				return true;
			} catch (e) {
				this.log.warn(`Failed to save replay R#${replay.id}: ${e.toString()}`);
				return false;
			}
		});
	}

	async checkBan(field: string, value: string) {
		const banQuery: any = {};
		banQuery[field] = value;
		try {
			return await this.db.getRepository(Ban).findOne(banQuery);
		} catch (e) {
			this.log.warn(`Failed to load ban ${field} ${value}: ${e.toString()}`);
			return null;
		}
	}

	async checkBanWithNameAndIP(name: string, ip: string) {
		try {
			return await this.db.getRepository(Ban).findOne({ name, ip });
		} catch (e) {
			this.log.warn(`Failed to load ban ${name} ${ip}: ${e.toString()}`);
			return null;
		}
	}

	getBan(name: string, ip: string) {
		const ban = new Ban();
		ban.ip = ip;
		ban.name = name;
		return ban;
	}

	async banPlayer(ban: Ban) {
		try {
			const repo = this.db.getRepository(Ban);
			if (await repo.findOne({
				ip: ban.ip,
				name: ban.name
			})) {
				return;
			}
			return await repo.save(ban);
		} catch (e) {
			this.log.warn(`Failed to update ban ${JSON.stringify(ban)}: ${e.toString()}`);
			return null;
		}
	}

	async getRandomDuelBan(ip: string) {
		const repo = this.db.getRepository(RandomDuelBan);
		try {
			const ban = await repo.findOne(ip);
			//console.log(ip, ban);
			return ban;
		} catch (e) {
			this.log.warn(`Failed to fetch random duel ban ${ip}: ${e.toString()}`);
			return null;
		}
	}

	async updateRandomDuelBan(ban: RandomDuelBan) {
		const repo = this.db.getRepository(RandomDuelBan);
		try {
			await repo.save(ban);
		} catch (e) {
			this.log.warn(`Failed to update random duel ban ${ban.ip}: ${e.toString()}`);
		}
	}

	async randomDuelBanPlayer(ip: string, reason: string, countadd?: number) {
		const count = countadd || 1;
		const repo = this.db.getRepository(RandomDuelBan);
		try {
			let ban = await repo.findOne(ip);
			if(ban) {
				ban.count += count;
				const banTime = ban.count > 3 ? Math.pow(2, ban.count - 3) * 2 : 0;
				const banDate = moment(ban.time);
				if(moment().isAfter(banDate)) {
					ban.time = moment().add(banTime, 'm').toDate();
				} else {
					ban.time = moment(banDate).add(banTime, 'm').toDate();
				}
				if(!_.contains(ban.reasons, reason)) {
					ban.reasons.push(reason);
				}
				ban.needTip = 1;
			} else {
				ban = new RandomDuelBan();
				ban.ip = ip;
				ban.time = moment().toDate();
				ban.count = count;
				ban.reasons = [reason];
				ban.needTip = 1;
			}
			return await repo.save(ban);
		} catch (e) {
			this.log.warn(`Failed to update random duel ban ${ip}: ${e.toString()}`);
			return null;
		}

	}

	async getAllDuelLogs() {
		const repo = this.db.getRepository(DuelLog);
		try {
			const allDuelLogs = await repo.find({relations: ["players"]});
			return allDuelLogs;
		} catch (e) {
			this.log.warn(`Failed to fetch duel logs: ${e.toString()}`);
			return [];
		}

	}

	async getDuelLogFromId(id: number) {
		const repo = this.db.getRepository(DuelLog);
		try {
			const duelLog = await repo.findOne(id, {relations: ["players"]});
			return duelLog;
		} catch (e) {
			this.log.warn(`Failed to fetch duel logs: ${e.toString()}`);
			return null;
		}

	}

	async getDuelLogFromRecoverSearch(realName: string) {
		const repo = this.db.getRepository(DuelLog);
		try {
			const duelLogs = await repo.createQueryBuilder("duelLog")
				.where("startDeckBuffer is not null and currentDeckBuffer is not null and roomMode != 2 and exists (select id from duel_log_player where duel_log_player.duelLogId = duelLog.id and duel_log_player.realName = :realName)", { realName })
				.orderBy("duelLog.id", "DESC")
				.limit(10)
				.leftJoinAndSelect("duelLog.players", "player")
				.getMany();
			return duelLogs;
		} catch (e) {
			this.log.warn(`Failed to fetch duel logs: ${e.toString()}`);
			return null;
		}

	}



	async getDuelLogJSON(tournamentModeSettings: any) {
		const allDuelLogs = await this.getAllDuelLogs();
		return allDuelLogs.map(duelLog => duelLog.getViewJSON(tournamentModeSettings));
	}
	async getAllReplayFilenames() {
		const allDuelLogs = await this.getAllDuelLogs();
		return allDuelLogs.map(duelLog => duelLog.replayFileName);
	}
	async clearDuelLog() {
		const runner = this.db.createQueryRunner();
		try {
			await runner.connect();
			await runner.startTransaction();
			await runner.query("SET FOREIGN_KEY_CHECKS = 0; ");
			await runner.clearTable("duel_log_player");
			await runner.clearTable("duel_log");
			await runner.query("SET FOREIGN_KEY_CHECKS = 1; ");
			await runner.commitTransaction();
		} catch (e) {
			await runner.rollbackTransaction();
			this.log.warn(`Failed to clear duel logs: ${e.toString()}`);
		}
	}
	async saveDuelLog(name: string, roomId: number, cloudReplayId: number, replayFilename: string, roomMode: number, duelCount: number, playerInfos: DuelLogPlayerInfo[]) {
		const duelLog = new DuelLog();
		duelLog.name = name;
		duelLog.time = moment().toDate();
		duelLog.roomId = roomId;
		duelLog.cloudReplayId = cloudReplayId;
		duelLog.replayFileName = replayFilename;
		duelLog.roomMode = roomMode;
		duelLog.duelCount = duelCount;
		const players = playerInfos.map(p => DuelLogPlayer.fromDuelLogPlayerInfo(p));
		await this.transaction(async (mdb) => {
			try {
				const savedDuelLog = await mdb.save(duelLog);
				for (let player of players) {
					player.duelLog = savedDuelLog;
				}
				await mdb.save(players);
				return true;
			} catch (e) {
				this.log.warn(`Failed to save duel log ${name}: ${e.toString()}`);
				return false;
			}
		});

	}
	async getUser(key: string) {
		const repo = this.db.getRepository(User);
		try {
			const user = await repo.findOne(key, {relations: ["dialogues", "usedKeys"]});
			return user;
		} catch (e) {
			this.log.warn(`Failed to fetch user: ${e.toString()}`);
			return null;
		}
	}
	async getOrCreateUser(key: string) {
		const user = await this.getUser(key);
		if(user) {
			return user;
		}
		const newUser = new User();
		newUser.key = key;
		return await this.saveUser(newUser);
	}
	async saveUser(user: User) {
		const repo = this.db.getRepository(User);
		try {
			return await repo.save(user);
		} catch (e) {
			this.log.warn(`Failed to save user: ${e.toString()}`);
			return user;
		}
	}
	async getUserChatColor(key: string) {
		const user = await this.getUser(key);
		return user ? user.chatColor : null;
	}
	async setUserChatColor(key: string, color: string) {
		let user = await this.getOrCreateUser(key);
		user.chatColor = color;
		return await this.saveUser(user);
	}
	async isUserVip(key: string) {
		const user = await this.getUser(key);
		return user ? user.isVip() : false;
	}
	async getUserDialogueText(key: string, cardCode: number) {
		try {
			const dialogue = await this.db.getRepository(UserDialog)
				.createQueryBuilder("dialog")
				.where("cardCode = :cardCode and userKey = :key", {cardCode, key})
				.getOne();
			if(dialogue) {
				return dialogue.text;
			} else {
				return null;
			}
		} catch(e) {
			this.log.warn(`Failed to find user dualogue ${key} ${cardCode}: ${e.toString()}`);
			return null;
		}
	}
	async getUserWords(key: string) {
		const user = await this.getUser(key);
		return user ? user.words : null;
	}
	async getUserVictoryWords(key: string) {
		const user = await this.getUser(key);
		return user ? user.victory : null;
	}
	async setUserWords(key: string, word: string) {
		const user = await this.getOrCreateUser(key);
		user.words = word;
		return await this.saveUser(user);
	}
	async setUserVictoryWords(key: string, word: string) {
		const user = await this.getOrCreateUser(key);
		user.victory = word;
		return await this.saveUser(user);
	}
	async setUserDialogues(key: string, cardCode: number, text: string) {
		const user = await this.getOrCreateUser(key);
		await this.transaction(async mdb => {
			try {
				let dialogue = await mdb.getRepository(UserDialog)
					.createQueryBuilder("dialog")
					.where("cardCode = :cardCode and userKey = :key", {cardCode, key})
					.innerJoinAndSelect("dialog.user", "user")
					.getOne();
				if(!dialogue) {
					dialogue = new UserDialog();
					dialogue.user = user;
					dialogue.cardCode = cardCode;
				}
				dialogue.text = text;
				await mdb.save(dialogue);
				return true;
			} catch (e) {
				this.log.warn(`Failed to save dialogue: ${e.toString()}`);
				return false;
			}
		});

	}

	async removeUserDialogues(key: string, cardCode: number) {
		try {
			await this.db.createQueryBuilder()
				.delete()
				.from(UserDialog)
				.where("cardCode = :cardCode and userKey = :key", {cardCode, key})
				.execute();
			return true;
		} catch (e) {
			this.log.warn(`Failed to remove dialogue: ${e.toString()}`);
			return false;
		}

	}

	async migrateChatColors(data: any) {
		await this.transaction(async (mdb) => {
			try {
				const users: User[] = [];
				for(let key in data) {
					const chatColor: string = data[key];
					let user = await mdb.findOne(User, key);
					if(!user) {
						user = new User();
						user.key = key;
					}
					user.chatColor = chatColor;
					users.push(user);
				}
				await mdb.save(users);
				return true;
			} catch (e) {
				this.log.warn(`Failed to migrate chat color data: ${e.toString()}`);
				return false;
			}
		});

	}

	async getVipKeys(keyType: number) {
		const repo = this.db.getRepository(VipKey);
		const queryCondition: any = {
			isUsed: 0
		};
		if (keyType) {
			queryCondition.type = keyType;
		}
		try {
			const keys = await repo.find(queryCondition);
			return keys.map(k => k.toJSON());
		} catch (e) {
			this.log.warn(`Failed to fetch keys of keyType ${keyType}: ${e.toString()}`);
			return [];
		}
	}

	async generateVipKeys(keyType: number, count: number){
		const vipKeys = _.range(count).map(() => {
			const keyText = Math.floor(Math.random() * 10000000000000000).toString();
			const key = new VipKey();
			key.key = keyText;
			key.type = keyType;
			return key;
		});
		try {
			await this.db.manager.save(vipKeys);
			return true;
		} catch (e) {
			this.log.warn(`Failed to generate keys of keyType ${keyType}: ${e.toString()}`);
			return false;
		}
	}

	async useVipKey(userKey: string, vipKeyText: string) {
		let user = await this.getOrCreateUser(userKey);
		let result = 0;
		await this.transaction(async (mdb) => {
			try {
				const vipKey = await mdb.findOne(VipKey, {key: vipKeyText, isUsed: 0});
				if(!vipKey) {
					return false;
				}
				const keyType = vipKey.type;
				const previousDate = user.vipExpireDate;
				if(previousDate && moment().isBefore(previousDate)) {
					user.vipExpireDate = moment(previousDate).add(keyType, "d").toDate();
				} else {
					user.vipExpireDate = moment().add(keyType, "d").toDate();
				}
				user = await mdb.save(user);
				vipKey.isUsed = 1;
				vipKey.usedBy = user;
				await mdb.save(vipKey);
				result = previousDate ? 2 : 1;
				return true;
			} catch (e) {
				this.log.warn(`Failed to use VIP key for user ${userKey} ${vipKeyText}: ${e.toString()}`);
				result = 0;
				return false;
			}
		});
		return result;
	}

	async migrateFromOldVipInfo(vipInfo: any) {
		await this.transaction(async (mdb) => {
			try {
				const vipKeyList = vipInfo.cdkeys;
				const newKeys: VipKey[] = [];
				for(let keyTypeString in vipKeyList) {
					const keyType = parseInt(keyTypeString);
					const keysTexts: string[] = vipKeyList[keyTypeString];
					for(let keyText of keysTexts) {
						const newKey = new VipKey()
						newKey.type = keyType;
						newKey.key = keyText;
						newKeys.push(newKey);
					}
				}
				await mdb.save(newKeys);
				for(let vipUserName in vipInfo.players) {
					const oldVipUserInfo = vipInfo.players[vipUserName];
					const userKey = vipUserName + '$' + oldVipUserInfo.password;
					let user = await mdb.findOne(User, userKey);
					if(user && user.isVip()) {
						continue;
					}
					if(!user) {
						user = new User();
						user.key = userKey;
					}
					user.vipExpireDate = moment(oldVipUserInfo.expire_date).toDate();
					user.victory = oldVipUserInfo.victory || null;
					user.words = oldVipUserInfo.words || null;
					user = await mdb.save(user);
					const newDialogues: UserDialog[] = [];
					for(let dialogueCardCodeText in oldVipUserInfo.dialogues) {
						const cardCode = parseInt(dialogueCardCodeText);
						const dialogueText = oldVipUserInfo.dialogues[dialogueCardCodeText];
						const dialogue = new UserDialog();
						dialogue.text = dialogueText;
						dialogue.cardCode = cardCode;
						dialogue.user = user;
						newDialogues.push(dialogue);
					}
					await mdb.save(newDialogues);
				}
				return true;
			} catch (e) {
				this.log.warn(`Failed to migrate vip info from previous one: ${e.toString()}`);
				return false;
			}
		});
	}
}
