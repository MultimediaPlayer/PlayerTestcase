#!/bin/bash

CNT=$1

echo $CNT

./git-pull.sh
./node-setup.sh

mkdir ../logs/

if [ "$CNT" == "aws" ]; then
  ./getcontent-markriley9999-aws.sh
elif [ "$CNT" == "minimal" ]; then
  ./getcontent-markriley9999-aws-minimal.sh
else
  ./getcontent-markriley9999-duk.sh
fi

echo --- Install Complete! ---
echo Type:
echo cd refPlayer/
echo ./run.sh
