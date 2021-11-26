cd ..
git fetch origin server
git reset --hard FETCH_HEAD
git submodule foreach git fetch origin master
git submodule foreach git reset --hard FETCH_HEAD
cd expansions
git pull
cd .. 
cp -r -f patch ocgcore
./premake5 gmake 
cd build 
make config=release -j$(nproc)
cd .. 
strip ygopro
cd .. 
cp ./config/bots.json ./windbot/ 