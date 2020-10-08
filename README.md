## SRVPro
A YGOPro server.

Now used in [Moecard](https://mycard.moe/), [YGOPro 233 service](https://ygo233.com/) and [YGOPro Koishi service](http://koishi.222diy.gdn/ ).

### Support function
* Run on Linux
* Run on Windows
* Players enter the same room name to make an appointment
* The player does not specify a room name, it will automatically match online players
* Room list json
* Broadcast message
* Summoning lines
* One-click update of advance card
* WindBot online AI
* Moe card user login
* Contest mode locks the player deck
* Save video in the background in competition mode
* Automatic overtime system in competition mode (adjustable rules)
  * 0 Normal overtime rules
  * 1 Rules for the 12th League of YGOCore Team League
  * 2 Normal overtime rules + 1 win rule
  * 3 OCG/TCG overtime rules applicable in July 2018
* Reconnect after disconnection

### Function not supported
* Online chat room

### Instructions
* Refer to [wiki](https://github.com/moecube/srvpro/wiki) to install
* Manual installation:
  * `git clone https://github.com/moecube/srvpro.git`
  * `cd srvpro`
  * `npm install`
  * Install the modified YGOPro server: https://github.com/moecube/ygopro/tree/server
* `node ygopro-server.js` can run
* The simple console is at http://srvpro.ygo233.com/dashboard.html or http://srvpro-cn.ygo233.com/dashboard.html
* Use the Docker image of this project: https://hub.docker.com/r/nanahira/ygopro-server/

  * Mirror label
    * `nanahira/ygopro-server:latest`: full mirror
    * `nanahira/ygopro-server:lite`: Basic mirroring, cloud video and human-machine battle functions need to be used with the two mirrors `redis` and `nanahira/windbot`

  * Port
    * `7911`: YGOPro port
    * `7922`: Management background port

  * Data volume
    * `/ygopro-server/config`: SRVPro configuration file data volume
    * `/ygopro-server/ygopro/expansions`: YGOPro extra card data volume
    * `/ygopro-server/decks`: Contest mode deck data volume
    * `/ygopro-server/replays`: Competition mode recording data volume

  * If you start the server in competition mode, it is recommended to modify the start command to `pm2-docker start /ygopro-server/data/pm2-docker-tournament.js`.

### Advanced Features
* To be added
* The simple advance card update console is at http://srvpro.ygo233.com/pre-dashboard.html or http://srvpro-cn.ygo233.com/pre-dashboard.html

### Development Plan
* Redo the CTOS and STOC parts
* Modular additional functions
  * Room name code
  * Random battle
  * Summoning lines
  * WindBot
  * Cloud video
  * Competition mode
  * Advance card update
* User account system and administrator account system
* Cloud video change storage method

### TODO
* refactoring CTOS and STOC
* change features to modules
  * room name parsing
  * random duel
  * summon dialogues
  * WindBot
  * cloud replay
  * tournament mode
  * expansions updater
* user and admin account system
* new database for cloud replay

### License
SRVPro

Copyright (C) 2013-2018 MoeCube Team

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.