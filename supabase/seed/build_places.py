import json, glob, re, math, unicodedata
S = "./work"
src = open("/home/claude/concit-app/data.js").read()
ZONES = {k: (n, float(a), float(b)) for k, n, a, b in re.findall(r'(\w+):\["([^"]+)",([\d.]+),([\d.]+)\]', src.split("const ZONES")[1].split("};")[0])}
EXIST = set(open(S + "/existing.txt").read().split("|"))

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\b(milano|milan|ristorante|pizzeria|trattoria|osteria|bar|caffe|cafe|pasticceria|the|di|da|del|la|il|lo|al|e|and|srl|since|dal)\b", " ", s)
    return " ".join(s.split())
EXN = {norm(n) for n in EXIST if n}

def dist(a, b, c, d):
    return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(45.47)))

# stations
ST = {}
for l in open(S + "/stations.txt"):
    lines, n, a, b = l.strip().split("|"); ST[n] = (lines.replace(",", ""), float(a), float(b))
places = {}
for f in sorted(glob.glob(S + "/raw/*")):
    for p in json.load(open(f))["places"]:
        places.setdefault(p["place_id"], p)
LINES = {}
for l, names in re.findall(r'(\d):"([^"]+)"', open("/home/claude/concit-app/app.js").read().split("const METRO_STATIONS=")[1].split("};")[0]):
    for n in names.split("|"): LINES.setdefault(n.lower(), set()).add(l)
for p in places.values():
    if "subway_station" in p["types"] or "transit_station" in p["types"]:
        n = re.sub(r"\s*(M\d|FS|FN)$", "", p["name"]).strip()
        n = {"S.Ambrogio": "Sant'Ambrogio", "S. Agostino": "Sant'Agostino", "S.Leonardo": "San Leonardo", "P.TA Genova": "Porta Genova", "Centrale Fs": "Centrale", "Milan Porta Venezia": "Porta Venezia", "Villa S. Giovanni": "Villa San Giovanni"}.get(n, n)
        if n not in ST and n.lower() in LINES:
            ST[n] = ("".join(sorted(LINES[n.lower()])), p["latitude"], p["longitude"])

def hm(t):
    t = t.strip().replace(" ", " ").replace(" ", " ")
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", t)
    h, mi, ap = int(m.group(1)), m.group(2), m.group(3)
    return h, mi, ap

def rng(r):
    r = r.replace(" ", " ").replace(" ", " ")
    a, b = [x.strip() for x in r.split("–")]
    ha, ma, apa = hm(a); hb, mb, apb = hm(b)
    if apa is None: apa = apb
    def to24(h, ap):
        if ap == "AM": return 0 if h == 12 else h
        return 12 if h == 12 else h + 12
    s, e = to24(ha, apa), to24(hb, apb)
    if apa == "PM" and apb == "PM" and s > e and not b: pass
    # "8:00 – 10:30 PM" style: both PM; if start would be > end treat start as AM
    if apa == apb == "PM" and to24(ha, "PM") > e: s = to24(ha, "AM")
    return f"{s:02d}{ma}-{e:02d}{mb}"

def hours(p):
    w = p.get("weekday_hours") or []
    if len(w) != 7: return ""
    out = []
    for d in w:
        v = d.split(": ", 1)[1].strip()
        if v == "Closed": out.append("C")
        elif "24 hours" in v: return ""
        else:
            try: out.append(",".join(rng(x) for x in v.split(",")))
            except Exception: return ""
    res = []
    for i, x in enumerate(out): res.append("=" if i and x == out[i - 1] else x)
    return "|".join(res)

PRI = ["night_club", "museum", "art_gallery", "performing_arts_theater", "movie_theater", "concert_hall", "bowling_alley", "amusement_center",
       "cocktail_bar", "wine_bar", "irish_pub", "brewpub", "brewery", "pub", "sports_bar", "lounge_bar", "beer_hall",
       "ice_cream_shop", "pastry_shop", "coffee_shop", "bakery", "brunch_restaurant", "breakfast_restaurant", "cafe", "tea_house",
       "pizza_restaurant", "sushi_restaurant", "ramen_restaurant", "japanese_restaurant", "chinese_restaurant", "thai_restaurant", "indian_restaurant",
       "korean_restaurant", "vietnamese_restaurant", "asian_restaurant", "mexican_restaurant", "peruvian_restaurant", "lebanese_restaurant",
       "middle_eastern_restaurant", "greek_restaurant", "spanish_restaurant", "african_restaurant", "turkish_restaurant", "brazilian_restaurant",
       "seafood_restaurant", "steak_house", "barbecue_restaurant", "hamburger_restaurant", "vegan_restaurant", "vegetarian_restaurant",
       "fine_dining_restaurant", "sandwich_shop", "kebab_shop", "fast_food_restaurant", "deli", "bistro", "italian_restaurant",
       "mediterranean_restaurant", "restaurant", "bar"]
LABEL = {"night_club": "Club", "museum": "Museum", "art_gallery": "Gallery", "performing_arts_theater": "Theatre", "movie_theater": "Cinema",
         "concert_hall": "Concert hall", "bowling_alley": "Bowling", "amusement_center": "Games and arcade", "cocktail_bar": "Cocktail bar",
         "wine_bar": "Wine bar", "irish_pub": "Irish pub", "brewpub": "Brewpub", "brewery": "Brewpub", "pub": "Pub", "sports_bar": "Sports bar",
         "lounge_bar": "Lounge bar", "beer_hall": "Beer hall", "ice_cream_shop": "Gelateria", "pastry_shop": "Pastry shop", "coffee_shop": "Coffee bar",
         "bakery": "Bakery", "brunch_restaurant": "Brunch spot", "breakfast_restaurant": "Breakfast spot", "cafe": "Café", "tea_house": "Tea room",
         "pizza_restaurant": "Pizzeria", "sushi_restaurant": "Sushi", "ramen_restaurant": "Ramen bar", "japanese_restaurant": "Japanese",
         "chinese_restaurant": "Chinese", "thai_restaurant": "Thai", "indian_restaurant": "Indian", "korean_restaurant": "Korean",
         "vietnamese_restaurant": "Vietnamese", "asian_restaurant": "Asian", "mexican_restaurant": "Mexican", "peruvian_restaurant": "Peruvian",
         "lebanese_restaurant": "Lebanese", "middle_eastern_restaurant": "Middle Eastern", "greek_restaurant": "Greek", "spanish_restaurant": "Spanish",
         "african_restaurant": "African", "turkish_restaurant": "Turkish", "brazilian_restaurant": "Brazilian", "seafood_restaurant": "Seafood",
         "steak_house": "Steakhouse", "barbecue_restaurant": "Grill", "hamburger_restaurant": "Burgers", "vegan_restaurant": "Vegan",
         "vegetarian_restaurant": "Vegetarian", "fine_dining_restaurant": "Fine dining", "sandwich_shop": "Sandwiches", "kebab_shop": "Kebab",
         "fast_food_restaurant": "Street food", "deli": "Deli", "bistro": "Bistro", "italian_restaurant": "Italian", "mediterranean_restaurant": "Mediterranean",
         "restaurant": "Restaurant", "bar": "Bar"}
CULT = {"Museum", "Gallery", "Theatre", "Cinema", "Concert hall", "Bowling", "Games and arcade"}
CAFE = {"Gelateria", "Pastry shop", "Coffee bar", "Bakery", "Brunch spot", "Breakfast spot", "Café", "Tea room"}
CHEAP = {"Sandwiches", "Kebab", "Street food", "Deli"}
DROP_PRIMARY = {"lodging", "hotel", "liquor_store", "grocery_store", "supermarket", "church", "park", "spa", "subway_station", "transit_station",
                "tourist_attraction", "historical_landmark", "shopping_mall", "clothing_store", "event_venue", "wedding_venue", "catering_service"}

def classify(p):
    t = p["types"]; nm = p["name"].lower()
    if not t or t[0] in DROP_PRIMARY and not any(x in t[:3] for x in ("cocktail_bar", "night_club", "museum", "art_gallery")): return None
    lab = None
    GENERIC = {"restaurant", "bar", "food", "point_of_interest", "establishment", "store", "food_store", "event_venue", "meal_takeaway"}
    if t[0] in LABEL and t[0] not in GENERIC:
        lab = LABEL[t[0]]
    else:
        for x in PRI:
            if x in t[:4] or (x == t[0]):
                lab = LABEL[x]; break
    if lab and lab != "Club":
        if re.search(r"trattoria|osteria|ristorante|pizzeria|ristoro|cucina", nm) and lab in CAFE | {"Wine bar", "Cocktail bar", "Lounge bar", "Bar", "Pub"}:
            lab = next((LABEL[x] for x in t if x in LABEL and x.endswith("restaurant")), "Restaurant")
        elif re.search(r"pasticceria|gelateria|gelato|bakery|panificio|panetteria|forno|coffee|caff[eè]|cafe\b|torrefazione|cornetteria", nm) and lab not in CAFE and not re.search(r"cocktail|bistr|wine|vino", nm):
            lab = "Gelateria" if "gelat" in nm else "Bakery" if re.search(r"bakery|panificio|panetteria|forno", nm) else "Pastry shop" if "pasticceria" in nm else "Coffee bar"
        elif re.search(r"cocktail|mixology|speakeasy", nm) and lab not in ("Cocktail bar",):
            lab = "Cocktail bar"
        elif re.search(r"enoteca|vineria|wine bar|vinoteca", nm) and lab in ("Bar", "Cocktail bar", "Lounge bar", "Restaurant", "Italian"):
            lab = "Wine bar"
        elif re.search(r"\bpub\b|birreria|birrificio|brewery|brewpub|beer", nm) and lab in ("Bar", "Cocktail bar", "Lounge bar", "Restaurant"):
            lab = "Pub"
    if lab is None: return None
    if lab == "Club" and not (t[0] == "night_club" and re.search(r"-0[2-6]", p.get("_hours",""))):
        rest = [x for x in PRI if x != "night_club" and (x in t[:4] or x == t[0])]
        if not rest: return None
        lab = LABEL[rest[0]]
    if lab in ("Italian", "Restaurant", "Mediterranean"):
        if "trattoria" in nm: lab = "Trattoria"
        elif "osteria" in nm: lab = "Osteria"
    if lab in ("Italian", "Restaurant", "Bistro") and "pizz" in nm: lab = "Pizzeria"
    pl = p.get("price_level")
    h = p.get("_hours", "")
    if lab == "Bar":
        first = h.split("|")[0] if h else ""
        early = re.match(r"(0[5-9]|10)", first or "")
        lab = "Café" if early or "cafe" in t or "coffee_shop" in t else "Bar"
    if lab in CULT: k = "u"
    elif lab == "Club": k = "n"
    elif lab in CAFE: k = "f"
    elif lab == "Wine bar": k = "w"
    elif lab in ("Irish pub", "Brewpub", "Pub", "Sports bar", "Beer hall"): k = "b"
    elif lab in ("Cocktail bar", "Lounge bar", "Bar"): k = "d"
    elif lab in CHEAP or pl == 1 or (lab in ("Burgers", "Kebab") and (pl or 2) <= 2): k = "c"
    else: k = "e"
    return k, lab

def addr(a):
    parts = [x.strip() for x in a.split(",")]
    s = parts[0]
    if len(parts) > 1 and re.match(r"^\d+[A-Za-z/]*$", parts[1]): s += " " + parts[1]
    return s

ACC_FROM = "àáâäãåèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑøØæ"
ACC_TO   = "aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCNoOa"
def sqlslug(n):
    s = n.translate(str.maketrans(ACC_FROM, ACC_TO))
    s = "".join(ch.lower() if "A" <= ch <= "Z" else ch for ch in s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-")
    return s
rows, seen_n, seen_id = [], set(), set()
stats = {}
for p in places.values():
    a = p.get("address", "")
    if not re.search(r"\bMilano\b|\bMilan\b", a): stats["notmilano"] = stats.get("notmilano", 0) + 1; continue
    n = p["name"].strip()
    if not p.get("rating") or (p.get("rating_count") or 0) < 40 or p["rating"] < 3.9: stats["lowq"] = stats.get("lowq", 0) + 1; continue
    p["_hours"] = hours(p)
    c = classify(p)
    if not c: stats["type"] = stats.get("type", 0) + 1; continue
    k, lab = c
    if re.search(r"starbucks|mcdonald|burger king|kfc|old wild west|roadhouse|autogrill|domino", n.lower()): stats["chain"]=stats.get("chain",0)+1; continue
    nn = norm(n)
    if not nn: nn = n.lower()
    if n.lower() in EXIST or nn in EXN: stats["exists"] = stats.get("exists", 0) + 1; continue
    lat, lng = p["latitude"], p["longitude"]
    key = (nn, round(lat, 3), round(lng, 3))
    if key in seen_n: continue
    seen_n.add(key)
    z = min(ZONES, key=lambda z: dist(lat, lng, ZONES[z][1], ZONES[z][2]))
    if dist(lat, lng, ZONES[z][1], ZONES[z][2]) > 5: stats["far"] = stats.get("far", 0) + 1; continue
    near = sorted((dist(lat, lng, v[1], v[2]), s, v[0]) for s, v in ST.items())
    metro = "" if not near or near[0][0] > 0.7 else near[0][2] + near[0][1]
    pl = p.get("price_level")
    pr = {1: 1, 2: 2, 3: 3, 4: 4}.get(pl, 1 if k == "c" else 2)
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", n.lower()).encode("ascii", "ignore").decode()).strip("-")[:40].strip("-")
    pid = slug if slug not in seen_id and slug not in {re.sub(r"[^a-z0-9]+", "-", e) for e in EXIST} else slug + "-" + z
    if pid in seen_id: continue
    seen_id.add(pid)
    rows.append(dict(id=pid, name=n.replace("~", "-"), k=k, zone=z, addr=addr(a).replace("~", "-"), lat=round(lat, 4), lng=round(lng, 4),
                     price=pr, stars=p["rating"], rev=p["rating_count"], hours=p["_hours"], metro=metro, label=lab))
from collections import Counter
print(len(rows), stats)
print(Counter(r["k"] for r in rows))
print(Counter(r["zone"] for r in rows).most_common())
json.dump(rows, open(S + "/rows.json", "w"), ensure_ascii=False)
with open(S + "/rows.txt", "w") as f:
    for r in rows:
        r = dict(r); r["id"] = "" if r["id"] == sqlslug(r["name"]) else r["id"]
        f.write("~".join(str(r[x]) for x in ("id", "name", "k", "zone", "addr", "lat", "lng", "price", "stars", "rev", "hours", "metro", "label")) + "\n")
