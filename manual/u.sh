cd ..
git fetch origin server 
git reset --hard FETCH_HEAD 
git submodule foreach git fetch origin master 
git submodule foreach git reset --hard FETCH_HEAD 
cd expansions 
git pull 
cd .. 
cp -f ./expansions/cards.cdb . 
cp -r -f ./patch/. ./ocgcore/ 
premake5 gmake 
cd build 
make config=release -j$(nproc) 
cd .. 
mv ./bin/release/ygopro . 
strip ygopro 
rm -rf LICENSE README.md sound textures strings.conf system.conf 
ls gframe | sed '/game.cpp/d' | xargs -I {} rm -rf gframe/{} 
cd .. 
cp ./config/bots.json ./windbot/ 

