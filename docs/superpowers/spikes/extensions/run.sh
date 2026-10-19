#!/bin/sh
cd "$(dirname "$0")"
./node_modules/.bin/electron . --scen=$1 > logs/$1.stdout 2>&1
