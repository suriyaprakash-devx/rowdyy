import csv
import io
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
from backend.upstox_client import upstox_client_manager

logger = logging.getLogger(__name__)

NIFTY_500_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty500list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
]

NIFTY_50_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty50list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"
]

NIFTY_100_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty100list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty100list.csv"
]

NIFTY_200_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty200list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty200list.csv"
]

# High-reliability fallback constituent symbols for Nifty 100 + Nifty 200
FALLBACK_NIFTY_SYMBOLS = [
    ("360ONE", "360 ONE WAM Ltd.", "INE466L01038"),
    ("ABB", "ABB India Ltd.", "INE117A01022"),
    ("ABCAPITAL", "Aditya Birla Capital Ltd.", "INE674K01013"),
    ("ADANIENSOL", "Adani Energy Solutions Ltd.", "INE931S01010"),
    ("ADANIENT", "Adani Enterprises Ltd.", "INE423A01024"),
    ("ADANIGREEN", "Adani Green Energy Ltd.", "INE364U01010"),
    ("ADANIPORTS", "Adani Ports and Special Economic Zone Ltd.", "INE742F01042"),
    ("ADANIPOWER", "Adani Power Ltd.", "INE814H01029"),
    ("AMBUJACEM", "Ambuja Cements Ltd.", "INE079A01024"),
    ("APARINDS", "Apar Industries Ltd.", "INE372A01015"),
    ("APLAPOLLO", "APL Apollo Tubes Ltd.", "INE702C01027"),
    ("APOLLOHOSP", "Apollo Hospitals Enterprise Ltd.", "INE437A01024"),
    ("ASHOKLEY", "Ashok Leyland Ltd.", "INE208A01029"),
    ("ASIANPAINT", "Asian Paints Ltd.", "INE021A01026"),
    ("ASTRAL", "Astral Ltd.", "INE006I01046"),
    ("ATGL", "Adani Total Gas Ltd.", "INE399L01023"),
    ("AUBANK", "AU Small Finance Bank Ltd.", "INE949L01017"),
    ("AUROPHARMA", "Aurobindo Pharma Ltd.", "INE406A01037"),
    ("AXISBANK", "Axis Bank Ltd.", "INE238A01034"),
    ("BAJAJ-AUTO", "Bajaj Auto Ltd.", "INE917I01010"),
    ("BAJAJFINSV", "Bajaj Finserv Ltd.", "INE918I01026"),
    ("BAJAJHLDNG", "Bajaj Holdings & Investment Ltd.", "INE118A01012"),
    ("BAJFINANCE", "Bajaj Finance Ltd.", "INE296A01032"),
    ("BANKBARODA", "Bank of Baroda", "INE028A01039"),
    ("BANKINDIA", "Bank of India", "INE084A01016"),
    ("BDL", "Bharat Dynamics Ltd.", "INE171Z01026"),
    ("BEL", "Bharat Electronics Ltd.", "INE263A01024"),
    ("BHARATFORG", "Bharat Forge Ltd.", "INE465A01025"),
    ("BHARTIARTL", "Bharti Airtel Ltd.", "INE397D01024"),
    ("BHEL", "Bharat Heavy Electricals Ltd.", "INE257A01026"),
    ("BIOCON", "Biocon Ltd.", "INE376G01013"),
    ("BLUESTARCO", "Blue Star Ltd.", "INE472A01039"),
    ("BOSCHLTD", "Bosch Ltd.", "INE323A01026"),
    ("BPCL", "Bharat Petroleum Corporation Ltd.", "INE029A01011"),
    ("BRITANNIA", "Britannia Industries Ltd.", "INE216A01030"),
    ("BSE", "BSE Ltd.", "INE118H01025"),
    ("CANBK", "Canara Bank", "INE476A01022"),
    ("CGPOWER", "CG Power and Industrial Solutions Ltd.", "INE067A01029"),
    ("CHOLAFIN", "Cholamandalam Investment and Finance Company Ltd.", "INE121A01024"),
    ("CIPLA", "Cipla Ltd.", "INE059A01026"),
    ("COALINDIA", "Coal India Ltd.", "INE522F01014"),
    ("COCHINSHIP", "Cochin Shipyard Ltd.", "INE704P01025"),
    ("COFORGE", "Coforge Ltd.", "INE591G01025"),
    ("COLPAL", "Colgate Palmolive (India) Ltd.", "INE259A01022"),
    ("CONCOR", "Container Corporation of India Ltd.", "INE111A01025"),
    ("CUMMINSIND", "Cummins India Ltd.", "INE298A01020"),
    ("DABUR", "Dabur India Ltd.", "INE016A01026"),
    ("DIVISLAB", "Divi's Laboratories Ltd.", "INE361B01024"),
    ("DIXON", "Dixon Technologies (India) Ltd.", "INE935N01020"),
    ("DLF", "DLF Ltd.", "INE271C01023"),
    ("DMART", "Avenue Supermarts Ltd.", "INE192R01011"),
    ("DRREDDY", "Dr. Reddy's Laboratories Ltd.", "INE089A01031"),
    ("EICHERMOT", "Eicher Motors Ltd.", "INE066A01021"),
    ("ENRIN", "Siemens Energy India Ltd.", "INE1NPP01017"),
    ("ETERNAL", "Eternal Ltd.", "INE758T01015"),
    ("EXIDEIND", "Exide Industries Ltd.", "INE302A01020"),
    ("FEDERALBNK", "Federal Bank Ltd.", "INE171A01029"),
    ("FORTIS", "Fortis Healthcare Ltd.", "INE061F01013"),
    ("GAIL", "GAIL (India) Ltd.", "INE129A01019"),
    ("GLENMARK", "Glenmark Pharmaceuticals Ltd.", "INE935A01035"),
    ("GMRAIRPORT", "GMR Airports Ltd.", "INE776C01039"),
    ("GODFRYPHLP", "Godfrey Phillips India Ltd.", "INE260B01028"),
    ("GODREJCP", "Godrej Consumer Products Ltd.", "INE102D01028"),
    ("GODREJPROP", "Godrej Properties Ltd.", "INE484J01027"),
    ("GRASIM", "Grasim Industries Ltd.", "INE047A01021"),
    ("GROWW", "Billionbrains Garage Ventures Ltd.", "INE0HOQ01053"),
    ("GVT&D", "GE Vernova T&D India Ltd.", "INE200A01026"),
    ("HAL", "Hindustan Aeronautics Ltd.", "INE066F01020"),
    ("HAVELLS", "Havells India Ltd.", "INE176B01034"),
    ("HCLTECH", "HCL Technologies Ltd.", "INE860A01027"),
    ("HDFCAMC", "HDFC Asset Management Company Ltd.", "INE127D01025"),
    ("HDFCBANK", "HDFC Bank Ltd.", "INE040A01034"),
    ("HDFCLIFE", "HDFC Life Insurance Company Ltd.", "INE795G01014"),
    ("HEROMOTOCO", "Hero MotoCorp Ltd.", "INE158A01026"),
    ("HINDALCO", "Hindalco Industries Ltd.", "INE038A01020"),
    ("HINDCOPPER", "Hindustan Copper Ltd.", "INE531E01026"),
    ("HINDPETRO", "Hindustan Petroleum Corporation Ltd.", "INE094A01015"),
    ("HINDUNILVR", "Hindustan Unilever Ltd.", "INE030A01027"),
    ("HINDZINC", "Hindustan Zinc Ltd.", "INE267A01025"),
    ("HYUNDAI", "Hyundai Motor India Ltd.", "INE0V6F01027"),
    ("ICICIAMC", "ICICI Prudential Asset Management Company Ltd.", "INE346A01027"),
    ("ICICIBANK", "ICICI Bank Ltd.", "INE090A01021"),
    ("ICICIGI", "ICICI Lombard General Insurance Company Ltd.", "INE765G01017"),
    ("IDEA", "Vodafone Idea Ltd.", "INE669E01016"),
    ("IDFCFIRSTB", "IDFC First Bank Ltd.", "INE092T01019"),
    ("INDHOTEL", "Indian Hotels Co. Ltd.", "INE053A01029"),
    ("INDIANB", "Indian Bank", "INE562A01011"),
    ("INDIGO", "InterGlobe Aviation Ltd.", "INE646L01027"),
    ("INDUSINDBK", "IndusInd Bank Ltd.", "INE095A01012"),
    ("INDUSTOWER", "Indus Towers Ltd.", "INE121J01017"),
    ("INFY", "Infosys Ltd.", "INE009A01021"),
    ("IOC", "Indian Oil Corporation Ltd.", "INE242A01010"),
    ("IRCTC", "Indian Railway Catering And Tourism Corporation Ltd.", "INE335Y01020"),
    ("IREDA", "Indian Renewable Energy Development Agency Ltd.", "INE202E01016"),
    ("IRFC", "Indian Railway Finance Corporation Ltd.", "INE053F01010"),
    ("ITC", "ITC Ltd.", "INE154A01025"),
    ("JINDALSTEL", "Jindal Steel Ltd.", "INE749A01030"),
    ("JIOFIN", "Jio Financial Services Ltd.", "INE758E01017"),
    ("JSWENERGY", "JSW Energy Ltd.", "INE121E01018"),
    ("JSWSTEEL", "JSW Steel Ltd.", "INE019A01038"),
    ("JUBLFOOD", "Jubilant Foodworks Ltd.", "INE797F01020"),
    ("KALYANKJIL", "Kalyan Jewellers India Ltd.", "INE303R01014"),
    ("KEI", "KEI Industries Ltd.", "INE878B01027"),
    ("KOTAKBANK", "Kotak Mahindra Bank Ltd.", "INE237A01036"),
    ("LAURUSLABS", "Laurus Labs Ltd.", "INE947Q01028"),
    ("LENSKART", "Lenskart Solutions Ltd.", "INE956O01016"),
    ("LGEINDIA", "LG Electronics India Ltd.", "INE324D01010"),
    ("LICHSGFIN", "LIC Housing Finance Ltd.", "INE115A01026"),
    ("LICI", "Life Insurance Corporation of India", "INE0J1Y01017"),
    ("LODHA", "Lodha Developers Ltd.", "INE670K01029"),
    ("LT", "Larsen & Toubro Ltd.", "INE018A01030"),
    ("LTF", "L&T Finance Ltd.", "INE498L01015"),
    ("LTM", "LTM Ltd.", "INE214T01019"),
    ("LUPIN", "Lupin Ltd.", "INE326A01037"),
    ("M&M", "Mahindra & Mahindra Ltd.", "INE101A01026"),
    ("M&MFIN", "Mahindra & Mahindra Financial Services Ltd.", "INE774D01024"),
    ("MAHABANK", "Bank of Maharashtra", "INE457A01014"),
    ("MANKIND", "Mankind Pharma Ltd.", "INE634S01028"),
    ("MARICO", "Marico Ltd.", "INE196A01026"),
    ("MARUTI", "Maruti Suzuki India Ltd.", "INE585B01010"),
    ("MAXHEALTH", "Max Healthcare Institute Ltd.", "INE027H01010"),
    ("MAZDOCK", "Mazagoan Dock Shipbuilders Ltd.", "INE249Z01020"),
    ("MCX", "Multi Commodity Exchange of India Ltd.", "INE745G01043"),
    ("MEESHO", "Meesho Ltd.", "INE0VDM01015"),
    ("MFSL", "Max Financial Services Ltd.", "INE180A01020"),
    ("MOTHERSON", "Samvardhana Motherson International Ltd.", "INE775A01035"),
    ("MOTILALOFS", "Motilal Oswal Financial Services Ltd.", "INE338I01027"),
    ("MPHASIS", "MphasiS Ltd.", "INE356A01018"),
    ("MRF", "MRF Ltd.", "INE883A01011"),
    ("MUTHOOTFIN", "Muthoot Finance Ltd.", "INE414G01012"),
    ("NATIONALUM", "National Aluminium Co. Ltd.", "INE139A01034"),
    ("NAUKRI", "Info Edge (India) Ltd.", "INE663F01032"),
    ("NESTLEIND", "Nestle India Ltd.", "INE239A01024"),
    ("NHPC", "NHPC Ltd.", "INE848E01016"),
    ("NLCINDIA", "NLC India Ltd.", "INE589A01014"),
    ("NMDC", "NMDC Ltd.", "INE584A01023"),
    ("NTPC", "NTPC Ltd.", "INE733E01010"),
    ("NYKAA", "FSN E-Commerce Ventures Ltd.", "INE388Y01029"),
    ("OBEROIRLTY", "Oberoi Realty Ltd.", "INE093I01010"),
    ("OFSS", "Oracle Financial Services Software Ltd.", "INE881D01027"),
    ("OIL", "Oil India Ltd.", "INE274J01014"),
    ("ONGC", "Oil & Natural Gas Corporation Ltd.", "INE213A01029"),
    ("PAGEIND", "Page Industries Ltd.", "INE761H01022"),
    ("PATANJALI", "Patanjali Foods Ltd.", "INE619A01035"),
    ("PAYTM", "One 97 Communications Ltd.", "INE982J01020"),
    ("PERSISTENT", "Persistent Systems Ltd.", "INE262H01021"),
    ("PFC", "Power Finance Corporation Ltd.", "INE134E01011"),
    ("PHOENIXLTD", "Phoenix Mills Ltd.", "INE211B01039"),
    ("PIDILITIND", "Pidilite Industries Ltd.", "INE318A01026"),
    ("PIIND", "PI Industries Ltd.", "INE603J01030"),
    ("PNB", "Punjab National Bank", "INE160A01022"),
    ("POLICYBZR", "PB Fintech Ltd.", "INE417T01026"),
    ("POLYCAB", "Polycab India Ltd.", "INE455K01017"),
    ("POWERGRID", "Power Grid Corporation of India Ltd.", "INE752E01010"),
    ("POWERINDIA", "Hitachi Energy India Ltd.", "INE07Y701011"),
    ("PREMIERENE", "Premier Energies Ltd.", "INE0BS701011"),
    ("PRESTIGE", "Prestige Estates Projects Ltd.", "INE811K01011"),
    ("RADICO", "Radico Khaitan Ltd", "INE944F01028"),
    ("RECLTD", "REC Ltd.", "INE020B01018"),
    ("RELIANCE", "Reliance Industries Ltd.", "INE002A01018"),
    ("RVNL", "Rail Vikas Nigam Ltd.", "INE415G01027"),
    ("SAIL", "Steel Authority of India Ltd.", "INE114A01011"),
    ("SBICARD", "SBI Cards and Payment Services Ltd.", "INE018E01016"),
    ("SBILIFE", "SBI Life Insurance Company Ltd.", "INE123W01016"),
    ("SBIN", "State Bank of India", "INE062A01020"),
    ("SHRIRAMFIN", "Shriram Finance Ltd.", "INE721A01047"),
    ("SIEMENS", "Siemens Ltd.", "INE003A01024"),
    ("SOLARINDS", "Solar Industries India Ltd.", "INE343H01029"),
    ("SRF", "SRF Ltd.", "INE647A01010"),
    ("SUNPHARMA", "Sun Pharmaceutical Industries Ltd.", "INE044A01036"),
    ("SUPREMEIND", "Supreme Industries Ltd.", "INE195A01028"),
    ("SUZLON", "Suzlon Energy Ltd.", "INE040H01021"),
    ("SWIGGY", "Swiggy Ltd.", "INE00H001014"),
    ("TATACAP", "Tata Capital Ltd.", "INE976I01016"),
    ("TATACOMM", "Tata Communications Ltd.", "INE151A01013"),
    ("TATACONSUM", "Tata Consumer Products Ltd.", "INE192A01025"),
    ("TATAPOWER", "Tata Power Co. Ltd.", "INE245A01021"),
    ("TATASTEEL", "Tata Steel Ltd.", "INE081A01020"),
    ("TCS", "Tata Consultancy Services Ltd.", "INE467B01029"),
    ("TECHM", "Tech Mahindra Ltd.", "INE669C01036"),
    ("TIINDIA", "Tube Investments of India Ltd.", "INE974X01010"),
    ("TITAN", "Titan Company Ltd.", "INE280A01028"),
    ("TMCV", "Tata Motors Ltd.", "INE1TAE01010"),
    ("TMPV", "Tata Motors Passenger Vehicles Ltd.", "INE155A01022"),
    ("TORNTPHARM", "Torrent Pharmaceuticals Ltd.", "INE685A01028"),
    ("TRENT", "Trent Ltd.", "INE849A01020"),
    ("TVSMOTOR", "TVS Motor Company Ltd.", "INE494B01023"),
    ("ULTRACEMCO", "UltraTech Cement Ltd.", "INE481G01011"),
    ("UNIONBANK", "Union Bank of India", "INE692A01016"),
    ("UNITDSPR", "United Spirits Ltd.", "INE854D01024"),
    ("UPL", "UPL Ltd.", "INE628A01036"),
    ("VAML", "Vedanta Aluminium Metal Ltd.", "INE1CDF01017"),
    ("VBL", "Varun Beverages Ltd.", "INE200M01039"),
    ("VEDL", "Vedanta Ltd.", "INE205A01025"),
    ("VMM", "Vishal Mega Mart Ltd.", "INE01EA01019"),
    ("VOLTAS", "Voltas Ltd.", "INE226A01021"),
    ("WAAREEENER", "Waaree Energies Ltd.", "INE377N01017"),
    ("WIPRO", "Wipro Ltd.", "INE075A01022"),
    ("YESBANK", "Yes Bank Ltd.", "INE528G01035"),
    ("ZYDUSLIFE", "Zydus Lifesciences Ltd.", "INE010B01027")
]

async def _fetch_constituent_csv(urls: List[str]) -> List[Tuple[str, str, str]]:
    """
    Fetches index constituent CSV and extracts (symbol, company_name, isin).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/csv,*/*"
    }

    async with httpx.AsyncClient(timeout=3.5, follow_redirects=True) as client:
        for url in urls:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200 and resp.text:
                    results = []
                    reader = csv.DictReader(io.StringIO(resp.text))
                    for row in reader:
                        symbol = (row.get("Symbol") or row.get("symbol") or "").strip()
                        company = (row.get("Company Name") or row.get("company_name") or "").strip()
                        isin = (row.get("ISIN Code") or row.get("isin") or "").strip()
                        if symbol:
                            results.append((symbol, company, isin))
                    if results:
                        logger.info(f"Successfully fetched {len(results)} constituents from {url}")
                        return results
            except Exception as e:
                logger.warning(f"Failed to fetch constituents from {url}: {e}")
    return []

import json
from pathlib import Path

async def get_combined_stock_universe(index_filter: str = "ALL") -> List[Dict[str, Any]]:
    """
    Obtains the comprehensive NIFTY 500 equity universe (501 stocks),
    dynamically maps them to Upstox instrument keys, attaches index membership flags
    (Nifty 50, Nifty 100, Nifty 200, Nifty 500, Midcap, Smallcap), and supports
    sub-universe filtering.

    Returns list of dicts:
    [
        {
            "symbol": "RELIANCE",
            "company": "Reliance Industries Ltd",
            "instrument_key": "NSE_EQ|INE002A01018",
            "isin": "INE002A01018",
            "industry": "Oil Gas & Consumable Fuels",
            "is_nifty50": True,
            "is_nifty100": True,
            "is_nifty200": True,
            "is_nifty500": True,
            "is_midcap": False,
            "is_smallcap": False
        },
        ...
    ]
    """
    constituents_file = Path(__file__).resolve().parent.parent / "data" / "nifty500_constituents.json"
    raw_candidates: List[Dict[str, Any]] = []

    # 1. Load from pre-built NIFTY 500 constituents file if present
    if constituents_file.exists():
        try:
            with open(constituents_file, "r", encoding="utf-8") as f:
                raw_candidates = json.load(f)
            logger.info(f"Loaded {len(raw_candidates)} stocks from nifty500_constituents.json")
        except Exception as e:
            logger.warning(f"Error loading nifty500_constituents.json: {e}")

    # 2. If constituents file was not present, fetch from official Nifty 500 URLs
    if not raw_candidates:
        logger.info("Fetching NIFTY 500 constituents from official NSE URLs...")
        fetched = await _fetch_constituent_csv(NIFTY_500_URLS)
        if fetched:
            raw_candidates = [
                {"symbol": sym, "company": comp, "isin": isin, "is_nifty500": True}
                for sym, comp, isin in fetched
            ]
        else:
            logger.warning("Using fallback constituent list for NIFTY universe.")
            raw_candidates = [
                {"symbol": sym, "company": comp, "isin": isin, "is_nifty500": True}
                for sym, comp, isin in FALLBACK_NIFTY_SYMBOLS
            ]

    # 3. Apply Index Sub-Filter if requested
    filt_upper = (index_filter or "ALL").strip().upper()
    if filt_upper in ("NIFTY50", "NIFTY_50", "TOP50"):
        raw_candidates = [c for c in raw_candidates if c.get("is_nifty50")]
    elif filt_upper in ("NIFTY100", "NIFTY_100"):
        raw_candidates = [c for c in raw_candidates if c.get("is_nifty100")]
    elif filt_upper in ("NIFTY200", "NIFTY_200"):
        raw_candidates = [c for c in raw_candidates if c.get("is_nifty200")]
    elif filt_upper in ("MIDCAP", "NIFTY_MIDCAP"):
        raw_candidates = [c for c in raw_candidates if c.get("is_midcap")]
    elif filt_upper in ("SMALLCAP", "NIFTY_SMALLCAP"):
        raw_candidates = [c for c in raw_candidates if c.get("is_smallcap")]

    # 4. Automatically remove duplicate symbols
    seen_symbols: Set[str] = set()
    unique_constituents: List[Dict[str, Any]] = []

    for item in raw_candidates:
        sym_clean = item.get("symbol", "").strip().upper()
        if sym_clean and sym_clean not in seen_symbols and not any(sym_clean.endswith(p) for p in ["BEES", "ETF"]):
            seen_symbols.add(sym_clean)
            unique_constituents.append(item)

    # 5. Load Upstox NSE instrument master for exact instrument_key mapping
    await upstox_client_manager.get_nse_instruments()

    # 6. Map symbols -> Upstox instrument_key and metadata
    final_universe: List[Dict[str, Any]] = []

    for item in unique_constituents:
        sym = item["symbol"]
        isin = item.get("isin", "")
        comp = item.get("company", sym)
        instrument = upstox_client_manager.map_symbol_to_instrument(sym, isin)
        
        inst_key = instrument["instrument_key"] if instrument else f"NSE_EQ|{isin or sym}"
        final_universe.append({
            "symbol": sym,
            "company": instrument.get("company") if instrument else comp,
            "instrument_key": inst_key,
            "isin": isin,
            "industry": item.get("industry", "Diversified"),
            "is_nifty50": bool(item.get("is_nifty50", False)),
            "is_nifty100": bool(item.get("is_nifty100", False)),
            "is_nifty200": bool(item.get("is_nifty200", False)),
            "is_nifty500": True,
            "is_midcap": bool(item.get("is_midcap", False)),
            "is_smallcap": bool(item.get("is_smallcap", False))
        })

    logger.info(f"Final NIFTY universe ready ({filt_upper}): {len(final_universe)} valid NSE equities.")
    return final_universe
