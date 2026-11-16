"""Writes madrid.js (areas, sights, metro, photos) from the research files. Usage: python3 build_madrid_js.py <folder> <out madrid.js>"""
import json, sys
S, OUT = sys.argv[1], sys.argv[2]
zones = json.load(open(S + "/zones.json")); metro = json.load(open(S + "/metro.json"))
try: sights = json.load(open(S + "/sights.json"))
except Exception: sights = []
try: photos = json.load(open(S + "/city_photos.json"))
except Exception: photos = None
for s in sights:
    if not s["id"].startswith("md-"): s["id"] = "md-" + s["id"]
colors = dict(metro["colors"]); colors["3"] = "#c9a800"; colors["12"] = "#8f8600"; colors["5"] = "#7fa30b"
m = {"pre": "L", "colors": colors, "stations": {k: "|".join(v) for k, v in metro["lines"].items()}, "trains": {}}
j = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
out = f'''/* Madrid: areas, sights, metro lines and photos. Places and events live in the database (city = 'madrid').
   Built by supabase/seed/build_madrid_js.py; a new city is another file like this one plus an entry in CITIES in app.js. */
"use strict";
const MADRID={{name:"Madrid",q:"Madrid",center:[40.4168,-3.7038],bounds:[[-3.742,40.388],[-3.652,40.468]],
 zones:{j(zones)},
 areas:["malasana","chueca","sol","latina","lavapies","letras","chamberi","ponzano","salamanca","retiro","arguelles","condeduque"],
 cuisine:["spanish","Spanish & tapas"],chips:["Open now","Under €15","Malasaña","Tapas"],
 metro:{j(m)},
 photos:{j(photos) if photos else "null"},
 sights:{j(sights)}}};
'''
open(OUT, "w").write(out)
print(len(out), "bytes,", len(sights), "sights, photos:", bool(photos))
