# usage: python3 tools/cams.py "1A 1B 2" out [i]
import json, sys, subprocess, os
from PIL import Image
S='/tmp/claude-0/-home-claude/8ff0b5fb-ec9b-5356-8520-0e7ed7b8d4a5/scratchpad'
cams=sys.argv[1].split(); out=sys.argv[2]; i=sys.argv[3] if len(sys.argv)>3 else '0'
steps=[{"wait":1500}]
for c in cams: steps += [{"eval":f"show('{c}',{i})"},{"wait":1600},{"shot":f"cam_{c}.png"}]
json.dump({"viewport":{"width":800,"height":450},"steps":steps}, open(S+'/c.json','w'))
subprocess.run(['python3','tools/shot.py',S+'/c.json'])
ims=[Image.open(f'shots/cam_{c}.png') for c in cams]
cols=2 if len(ims)>1 else 1; rows=(len(ims)+cols-1)//cols
W=Image.new('RGB',(800*cols,450*rows)); [W.paste(im,((k%cols)*800,(k//cols)*450)) for k,im in enumerate(ims)]
W.save(f'shots/{out}.png')
