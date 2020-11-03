# Dockerfile for SRVPro Lite
FROM debian:stable-slim
FROM node:12-buster-slim

RUN npm install -g pm2

# apt
RUN apt update && apt install -y wget git \
    build-essential \
    libevent-dev \
    libsqlite3-dev \
    mono-complete \
    p7zip-full \
    python3 \
    liblua5.3-dev \
    && rm -rf /var/lib/apt/lists/*

# srvpro
COPY . /ygopro-server
WORKDIR /ygopro-server
RUN npm ci && mkdir decks replays logs

# ygopro
RUN git clone --branch=server --recursive --depth=1 https://github.com/purerosefallen/ygopro && \
    cd ygopro && \
    git clone --recursive https://LordOfNightmares@bitbucket.org/LordOfNightmares/expansions expansions && \
    git submodule foreach git checkout master && \
    wget -O - https://github.com/premake/premake-core/releases/download/v5.0.0-alpha14/premake-5.0.0-alpha14-linux.tar.gz | tar zfx - && \
    ./premake5 gmake && \
    cd build && \
    make config=release -j$(nproc) && \
    cd .. && \
    mv ./bin/release/ygopro . && \
    strip ygopro && \
    mkdir replay && \
    rm -rf LICENSE README.md sound textures strings.conf system.conf && \
    ls gframe | sed '/game.cpp/d' | xargs -I {} rm -rf gframe/{}
#     rm -rf .git* bin obj build ocgcore cmake lua premake*.travis.yml *.txt appveyor.yml *.lua 
# windbot
RUN git clone --depth=1 https://github.com/purerosefallen/windbot /tmp/windbot && \
    cd /tmp/windbot && \
    xbuild /property:Configuration=Release /property:TargetFrameworkVersion="v4.5" && \
    mv /tmp/windbot/bin/Release /ygopro-server/windbot && \
    cp -rf /ygopro-server/ygopro/cards.cdb /ygopro-server/windbot/ && \
    rm -rf /tmp/windbot
# infos
WORKDIR /ygopro-server
EXPOSE 7911 7922 7933
# VOLUME [ /ygopro-server/config, /ygopro-server/decks, /ygopro-server/replays ]

CMD [ "pm2-docker", "start", "/ygopro-server/data/pm2-docker-slim.json" ]
# CMD [ "node", "ygopro-server.js" ]
