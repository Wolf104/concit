"""Turns the Madrid venue lines gathered from Google Maps (work/madrid/places/*.jsonl) into rows for the places table.
Usage: python3 build_madrid_places.py <folder with places/*.jsonl and stations.json> <out.json>"""
import json, glob, re, math, sys, unicodedata, collections
S, OUT = sys.argv[1], sys.argv[2]
CHECKED = "16 Nov 2026"
ZONES = json.load(open(S + "/zones.json"))
def dist(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(40.42)))
try: ST = json.load(open(S + "/stations.json"))
except Exception: ST = []
def slug(s):
    s = unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")
def norm(s):
    s = re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode())
    s = re.sub(r"\b(madrid|restaurante|bar|cafe|cafeteria|taberna|bodega|the|de|del|la|el|los|las|y|and)\b", " ", s)
    return " ".join(s.split())

LABEL = {"night_club": "Club", "dance_hall": "Club", "museum": "Museum", "art_museum": "Museum", "history_museum": "Museum", "art_gallery": "Gallery",
 "cultural_center": "Cultural centre", "performing_arts_theater": "Theatre", "comedy_club": "Comedy club", "movie_theater": "Cinema", "concert_hall": "Concert hall",
 "live_music_venue": "Live music", "bowling_alley": "Bowling", "amusement_center": "Games and arcade", "karaoke": "Karaoke", "video_arcade": "Games and arcade",
 "cocktail_bar": "Cocktail bar", "wine_bar": "Wine bar", "winery": "Wine bar", "irish_pub": "Irish pub", "brewpub": "Brewpub", "brewery": "Brewpub", "pub": "Pub", "gastropub": "Pub",
 "sports_bar": "Sports bar", "lounge_bar": "Lounge bar", "beer_hall": "Beer hall", "beer_garden": "Beer hall",
 "ice_cream_shop": "Ice cream", "pastry_shop": "Pastry shop", "cake_shop": "Pastry shop", "dessert_shop": "Desserts", "donut_shop": "Desserts", "chocolate_shop": "Chocolatería",
 "coffee_shop": "Coffee bar", "bakery": "Bakery", "brunch_restaurant": "Brunch spot", "breakfast_restaurant": "Breakfast spot", "cafe": "Café", "cafeteria": "Café", "tea_house": "Tea room", "dog_cafe": "Café",
 "pizza_restaurant": "Pizzeria", "sushi_restaurant": "Sushi", "ramen_restaurant": "Ramen bar", "japanese_restaurant": "Japanese", "chinese_restaurant": "Chinese",
 "chinese_noodle_restaurant": "Chinese", "hot_pot_restaurant": "Hot pot", "thai_restaurant": "Thai", "indian_restaurant": "Indian", "korean_restaurant": "Korean",
 "korean_barbecue_restaurant": "Korean", "vietnamese_restaurant": "Vietnamese", "asian_restaurant": "Asian", "mexican_restaurant": "Mexican", "taco_restaurant": "Mexican",
 "peruvian_restaurant": "Peruvian", "argentinian_restaurant": "Argentinian", "colombian_restaurant": "Colombian", "latin_american_restaurant": "Latin American",
 "lebanese_restaurant": "Lebanese", "middle_eastern_restaurant": "Middle Eastern", "falafel_restaurant": "Middle Eastern", "halal_restaurant": "Halal", "greek_restaurant": "Greek",
 "african_restaurant": "African", "turkish_restaurant": "Turkish", "brazilian_restaurant": "Brazilian", "french_restaurant": "French", "belgian_restaurant": "Belgian",
 "ukrainian_restaurant": "Ukrainian", "american_restaurant": "American", "fusion_restaurant": "Fusion", "seafood_restaurant": "Seafood", "steak_house": "Steakhouse",
 "barbecue_restaurant": "Grill", "hamburger_restaurant": "Burgers", "hot_dog_restaurant": "Hot dogs", "vegan_restaurant": "Vegan", "vegetarian_restaurant": "Vegetarian",
 "fine_dining_restaurant": "Fine dining", "sandwich_shop": "Sandwiches", "kebab_shop": "Kebab", "fast_food_restaurant": "Street food", "meal_takeaway": "Street food", "deli": "Deli",
 "bistro": "Bistro", "italian_restaurant": "Italian", "tapas_restaurant": "Tapas bar", "tapas_bar": "Tapas bar", "basque_restaurant": "Basque", "spanish_restaurant": "Spanish",
 "bar_and_grill": "Bar and grill", "mediterranean_restaurant": "Mediterranean", "restaurant": "Restaurant", "bar": "Bar", "market": "Food market"}
GENERIC = {"restaurant", "bar", "food", "point_of_interest", "establishment", "store", "food_store", "event_venue", "meal_takeaway", "bar_and_grill", "tourist_attraction", "meal_delivery"}
CULT = {"Museum", "Gallery", "Cultural centre", "Theatre", "Comedy club", "Cinema", "Concert hall", "Live music", "Bowling", "Games and arcade", "Karaoke", "Flamenco show", "Escape room"}
CAFE = {"Ice cream", "Pastry shop", "Desserts", "Chocolatería", "Churrería", "Coffee bar", "Bakery", "Brunch spot", "Breakfast spot", "Café", "Tea room"}
CHEAP = {"Sandwiches", "Kebab", "Street food", "Deli", "Hot dogs"}
BEER = {"Irish pub", "Brewpub", "Pub", "Sports bar", "Beer hall", "Cervecería"}
DROP = {"lodging", "hotel", "liquor_store", "grocery_store", "supermarket", "church", "park", "spa", "subway_station", "transit_station", "clothing_store", "wedding_venue",
        "catering_service", "travel_agency", "tour_agency", "shopping_mall", "gym", "school", "stadium", "night_club_x"}
CHAINS = re.compile(r"\b(starbucks|mcdonald|burger king|kfc|telepizza|domino|100 montaditos|vips\b|rodilla|taco bell|subway|five guys|goiko|tgb|papa john|dunkin|tim hortons|popeyes|foster'?s hollywood|la sure[nñ]a|lizarran|llaollao|pans & company|ginos)", re.I)

def late(h):
    return any(re.search(r"-0[2-7]\d\d", d) for d in h)
def classify(p):
    t = p.get("t") or []; nm = p["n"].lower(); h = p.get("h") or []
    if not t or (t[0] in DROP and not any(x in t for x in ("cocktail_bar", "night_club", "museum", "art_gallery"))): return None
    lab = LABEL.get(t[0]) if t[0] not in GENERIC else None
    if lab is None:
        lab = next((LABEL[x] for x in t if x in LABEL and x not in GENERIC), None) or next((LABEL[x] for x in t if x in LABEL), None)
    if lab is None: return None
    if re.search(r"escape|room escape|scape room", nm): lab = "Escape room"
    elif re.search(r"tablao|flamenco", nm) and lab not in ("Museum",): lab = "Flamenco show"
    elif re.search(r"karaoke", nm): lab = "Karaoke"
    elif re.search(r"churrer|chocolater", nm): lab = "Churrería"
    elif lab not in CULT and lab != "Club":
        if re.search(r"helad|gelat|ice cream", nm): lab = "Ice cream"
        elif re.search(r"pasteler|confiter|reposter", nm): lab = "Pastry shop"
        elif re.search(r"panader|bakery|\bhorno\b|\bobrador\b", nm) and lab in CAFE | {"Restaurant", "Bar"}: lab = "Bakery"
        elif re.search(r"coffee|caf[eé]\b|cafeter|tostador|roaster|brunch", nm) and lab in ("Restaurant", "Bar", "Bar and grill", "Spanish", "Mediterranean"): lab = "Brunch spot" if "brunch" in nm else "Coffee bar"
        elif re.search(r"cocktail|coctel|mixolog|speakeasy", nm): lab = "Cocktail bar"
        elif re.search(r"vermut|vermuter|vinoteca|enoteca|wine bar|\bvinos\b|bodega", nm) and lab in ("Bar", "Cocktail bar", "Lounge bar", "Restaurant", "Spanish", "Bar and grill", "Tapas bar"): lab = "Wine bar"
        elif re.search(r"cervecer|craft beer|brew|\bbeer\b|cervezas|\bpub\b|tap ?room", nm) and lab in ("Bar", "Lounge bar", "Restaurant", "Spanish", "Bar and grill", "Tapas bar"): lab = "Cervecería"
        elif re.search(r"pizz", nm) and lab in ("Italian", "Restaurant", "Bistro"): lab = "Pizzeria"
        elif re.search(r"taberna|tasca|casa de comidas|meson|mesón|asador|marisquer|sidrer", nm) and lab in ("Restaurant", "Bar", "Bar and grill", "Mediterranean"):
            lab = "Seafood" if "marisquer" in nm else "Grill" if "asador" in nm else "Taberna"
        elif re.search(r"tapas|tapeo|pintxo|pincho|croquet", nm) and lab in ("Restaurant", "Bar", "Bar and grill", "Mediterranean", "Spanish"): lab = "Tapas bar"
    if lab == "Club":
        if re.search(r"jazz|live music|sala de conciertos|cabaret", nm) or (t[0] != "night_club" and "live_music_venue" in t[:3]): lab = "Live music"
        elif not ((late(h) or not h) and (t[0] in ("night_club", "dance_hall") or "night_club" in t[:2])):
            rest = [x for x in t if x in LABEL and x not in GENERIC and x not in ("night_club", "dance_hall")]
            lab = LABEL[rest[0]] if rest else ("Bar" if "bar" in t else None)
            if lab is None: return None
    if "night_club" in t[:3] and re.search(r"\bclub\b|discoteca|\bdisco\b", nm) and lab not in ("Karaoke", "Live music", "Flamenco show", "Comedy club"): lab = "Club"
    if lab == "Bar and grill": lab = "Spanish" if "spanish_restaurant" in t or "tapas_restaurant" in t else "Bar" if "bar" == t[1:2] and not "restaurant" in t else "Restaurant"
    if lab == "Bar":
        first = next((d for d in h if d != "C"), "")
        if "restaurant" in t or "spanish_restaurant" in t or "tapas_restaurant" in t: lab = "Tapas bar"
        elif re.match(r"0[5-9]", first) or "cafe" in t or "coffee_shop" in t: lab = "Café"
    pl = p.get("p")
    if lab in CULT: k = "culture"
    elif lab == "Club": k = "club"
    elif lab in CAFE: k = "cafe"
    elif lab == "Wine bar": k = "wine"
    elif lab in BEER: k = "beer"
    elif lab in ("Cocktail bar", "Lounge bar", "Bar"): k = "drink"
    elif lab == "Food market": k = "cheap"
    elif lab in CHEAP or pl == 1 or (lab in ("Burgers", "Kebab", "Hot dogs") and (pl or 2) <= 2): k = "cheap"
    else: k = "eat"
    return k, lab

CUIS = {"Pizzeria": "pizza", "Italian": "pasta", "Sushi": "sushi", "Japanese": "sushi", "Seafood": "seafood", "Steakhouse": "meat", "Grill": "meat", "Argentinian": "meat",
        "Burgers": "street", "Sandwiches": "street", "Kebab": "street", "Street food": "street", "Deli": "street", "Hot dogs": "street", "Food market": "street",
        "Vegan": "veggie", "Vegetarian": "veggie", "Fine dining": "fine", "Spanish": "spanish", "Tapas bar": "spanish", "Taberna": "spanish", "Basque": "spanish"}
for x in ("Ramen bar", "Chinese", "Hot pot", "Thai", "Indian", "Korean", "Vietnamese", "Asian"): CUIS[x] = "asian"
for x in ("Mexican", "Peruvian", "Colombian", "Latin American", "Lebanese", "Middle Eastern", "Halal", "Greek", "African", "Turkish", "Brazilian", "French", "Belgian", "Ukrainian", "American", "Fusion"): CUIS[x] = "world"
COST = {"cafe": ("coffee", [3, 4, 6, 6]), "eat": ("meal", [14, 26, 42, 80]), "cheap": ("meal", [12, 16, 22, 22]), "drink": ("drink", [5, 9, 13, 18]),
        "wine": ("drink", [4, 6, 9, 12]), "beer": ("drink", [4, 6, 8, 8]), "club": ("entry", [12, 18, 25, 30])}
TICKET = {"Museum": 10, "Gallery": 0, "Cultural centre": 0, "Theatre": 25, "Comedy club": 15, "Cinema": 9, "Concert hall": 30, "Live music": 15, "Bowling": 9, "Games and arcade": 15,
          "Karaoke": 10, "Flamenco show": 35, "Escape room": 20}
OCC = {"eat": ["dinner"], "cheap": ["cheap"], "cafe": ["coffee"], "club": ["night"], "culture": ["culture"], "drink": ["drinks"], "wine": ["drinks"], "beer": ["drinks"]}
DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]

def addr(a):
    parts = [x.strip() for x in a.split(",")]
    s = parts[0]
    if len(parts) > 1 and re.match(r"^\d+[A-Za-z/º-]*$", parts[1]): s += " " + parts[1]
    s = re.sub(r"^C\.\s*(de |del )?", lambda m: "Calle " + (m.group(1) or ""), s); s = re.sub(r"^C/\s*", "Calle ", s); s = re.sub(r"^C (?=[A-Zde])", "Calle ", s)
    s = re.sub(r"^Av\.\s*|^Avda\.\s*", "Avenida ", s); s = re.sub(r"^Pl\.\s*|^Pza\.\s*", "Plaza ", s); s = re.sub(r"^P\.º\s*|^Pº\s*", "Paseo ", s)
    s = re.sub(r"^Cta\.\s*", "Cuesta ", s); s = re.sub(r"^Rda\.\s*", "Ronda ", s); s = re.sub(r"^Gta\.\s*", "Glorieta ", s); s = re.sub(r"^Tr\.\s*|^Trav\.\s*", "Travesía ", s)
    return s[:70]

P = {}
for f in sorted(glob.glob(S + "/places/*.jsonl")):
    for l in open(f):
        l = l.strip()
        if not l: continue
        try: p = json.loads(l)
        except Exception: continue
        if p.get("id") and p["id"] not in P: P[p["id"]] = p
rows, seen_ids, seen_names, stats = [], set(), set(), collections.Counter()
for p in sorted(P.values(), key=lambda p: -(p.get("rc") or 0)):
    try: lat, lng, r, rc = float(p["lat"]), float(p["lng"]), float(p.get("r") or 0), int(p.get("rc") or 0)
    except Exception: stats["bad"] += 1; continue
    if "Madrid" not in p.get("a", "") and "Pozuelo" not in p.get("a", ""): stats["not madrid"] += 1; continue
    isclub = "night_club" in (p.get("t") or [])[:3]
    if (r < 3.9 or rc < 40) and not (isclub and r >= 3.2 and rc >= 300): stats["low rating"] += 1; continue
    if CHAINS.search(p["n"]): stats["chain"] += 1; continue
    h = p.get("h") or []
    if len(h) != 7 or not all(d == "C" or re.fullmatch(r"\d{4}-\d{4}(,\d{4}-\d{4})*", d) for d in h): h = []
    if h and all(d == "C" for d in h): stats["closed"] += 1; continue
    c = classify({**p, "h": h})
    if not c: stats["no class"] += 1; continue
    kind, lab = c
    zone, zd = min(((k, dist(lat, lng, z[1], z[2])) for k, z in ZONES.items()), key=lambda x: x[1])
    if zd > 2.6: stats["too far"] += 1; continue
    key = norm(p["n"]) + "|" + zone
    if key in seen_names and norm(p["n"]): stats["same name"] += 1; continue
    seen_names.add(key)
    name = re.sub(r"\s*[|·•]\s.*$", "", p["n"]).strip()
    name = re.sub(r"\s+-\s+(Madrid|Restaurante.*|Centro|Bar .*|Cocktail.*|Coctel.*)$", "", name, flags=re.I).strip()[:60]
    pid = "p:mad-" + slug(name)[:38].strip("-"); base, i = pid, 2
    while pid in seen_ids: pid = f"{base}-{i}"; i += 1
    seen_ids.add(pid)
    pl = p.get("p") if p.get("p") in (1, 2, 3, 4) else 2
    if kind == "culture": costs = {"ticket": TICKET.get(lab, 12)}
    else: u, a = COST[kind]; costs = {u: a[pl - 1]}
    closed = [(i + 1) % 7 for i, d in enumerate(h) if d == "C"]
    hours = "|".join("=" if i and d == h[i - 1] else d for i, d in enumerate(h))
    zn = ZONES[zone][0]
    NOUN = {"Ice cream": "Ice cream shop", "Desserts": "Dessert shop", "Live music": "Live music venue", "Burgers": "Burger place", "Hot dogs": "Hot dog place",
            "Sandwiches": "Sandwich bar", "Kebab": "Kebab shop", "Street food": "Street food spot", "Games and arcade": "Games and arcade venue", "Karaoke": "Karaoke bar",
            "Bowling": "Bowling alley", "Hot pot": "Hot pot restaurant", "Fine dining": "Fine dining restaurant", "Sushi": "Sushi restaurant", "Seafood": "Seafood restaurant"}
    noun = NOUN.get(lab) or (lab + " restaurant" if kind in ("eat", "cheap") and lab not in ("Pizzeria", "Steakhouse", "Grill", "Bistro", "Tapas bar", "Taberna", "Ramen bar", "Restaurant", "Food market", "Deli", "Bar", "Café", "Pub") and lab not in CAFE | BEER else lab)
    det = f"{noun} in {zn}."
    if h:
        cd = [DAYS[i] for i, d in enumerate(h) if d == "C"]; od = [DAYS[i] for i, d in enumerate(h) if d != "C"]
        lst = lambda x: " and ".join(x) if len(x) < 3 else ", ".join(x[:-1]) + " and " + x[-1]
        det += " Open every day." if not cd else f" Open only on {lst(od)}." if len(cd) >= 4 else f" Closed on {lst(cd)}."
        if late(h) and kind != "club": det += " Open late."
    why = (p.get("why") or "").strip().rstrip(".")[:110] or f"{lab} in {zn}"
    metro = []
    if ST:
        s, sd = min(((s, dist(lat, lng, s["lat"], s["lng"])) for s in ST), key=lambda x: x[1])
        if sd <= 0.6: metro = [["L" + l, s["name"]] for l in s["lines"][:3]]
    cu = [CUIS[lab]] if kind in ("eat", "cheap") and lab in CUIS else []
    rows.append({"id": pid, "name": name, "kind": kind, "zone": zone, "addr": addr(p["a"]), "metro": metro, "price": min(pl, 3), "hot": 1, "why": why[0].upper() + why[1:],
                 "detail": det, "src": f"Google Maps listing, checked {CHECKED}", "closed": closed, "occ": OCC[kind] + (["cheap"] if kind == "beer" and pl == 1 else []),
                 "lat": round(lat, 5), "lng": round(lng, 5), "costs": costs, "cuisine": cu, "web": None, "stars": r, "reviews": rc, "hours": hours, "city": "madrid", "_lab": lab, "_gid": p["id"]})
    stats[kind] += 1
json.dump(rows, open(OUT, "w"), ensure_ascii=False)
print(len(rows), dict(stats))
print(collections.Counter(r["zone"] for r in rows).most_common())
print(collections.Counter(r["_lab"] for r in rows).most_common(70))
