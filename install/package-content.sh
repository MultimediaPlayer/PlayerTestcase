#!/bin/bash

NAME=$1
DASHNAME=$(echo $1 | sed 's#/#\-#g')

if [ ! -d "tmp/" ]; then
	mkdir tmp/
fi

tar -czvf tmp/refplayer-content-$DASHNAME.tar.gz --exclude={*.mpd,*.xml,*.txt,*.bin} ../content/$NAME
tar -tf tmp/refplayer-content-$DASHNAME.tar.gz
