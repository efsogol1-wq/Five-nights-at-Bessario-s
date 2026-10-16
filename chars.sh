#!/bin/bash
# usage: tools/chars.sh <query-extra> <prefix>
S=/tmp/claude-0/-home-claude/8ff0b5fb-ec9b-5356-8520-0e7ed7b8d4a5/scratchpad
node tools/build.mjs >/dev/null || exit 1
for k in bessario kiril kira lebron victor; do
  echo "{\"viewport\":{\"width\":500,\"height\":500},\"query\":\"?only=$k&$1\",\"steps\":[{\"wait\":2500},{\"shot\":\"c_$k.png\"}]}" > $S/h.json
  python3 tools/shot.py $S/h.json >/dev/null
done
python3 -c "
from PIL import Image
ims=[Image.open('shots/c_'+k+'.png') for k in ['bessario','kiril','kira','lebron','victor']]
W=Image.new('RGB',(1500,1000)); [W.paste(im.resize((500,500)),((i%3)*500,(i//3)*500)) for i,im in enumerate(ims)]
W.save('shots/$2.png')"
