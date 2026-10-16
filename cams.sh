#!/bin/bash
# usage: tools/cams.sh "1A 1B 2" [extra-query] [out]
S=/tmp/claude-0/-home-claude/8ff0b5fb-ec9b-5356-8520-0e7ed7b8d4a5/scratchpad
node tools/build.mjs >/dev/null || exit 1
LIST=""
for c in $1; do
  echo "{\"viewport\":{\"width\":800,\"height\":450},\"query\":\"?cam=$c&$2\",\"allLogs\":false,\"steps\":[{\"wait\":1200},{\"shot\":\"cam_$c.png\"}]}" > $S/c.json
  python3 tools/shot.py $S/c.json | grep -i "error" ; LIST="$LIST shots/cam_$c.png"
done
python3 -c "
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]
n=len(ims); cols=2; rows=(n+1)//2
W=Image.new('RGB',(800*cols,450*rows)); [W.paste(im,((i%cols)*800,(i//cols)*450)) for i,im in enumerate(ims)]
W.save(sys.argv[1])" shots/${3:-cams}.png $LIST
