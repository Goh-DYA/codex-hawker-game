export const EXPECTED_FOOD_FILE_SHA256 =
  "1bc212db6eda06c29a5f8a1ddfe8a0ca82b02a71ffc34c07ced45d8b2f9b273e";

export const EXPECTED_GUIDELINE_FILE_SHA256 =
  "c87987b4281c8557f75b61fefa96d95d13e9ff60c2c41e38fe4a428219064ab4";

const released = (
  dishId,
  foodName,
  nutritionClass,
  reviewNote,
  mappingKind = "exact",
  multiplier = 1,
  servingLabel,
) => ({
  dishId,
  foodName,
  nutritionClass,
  reviewNote,
  mappingKind,
  multiplier,
  ...(servingLabel === undefined ? {} : { servingLabel }),
});

const unavailable = (dishId, reviewNote, nutritionClass = "meal") => ({
  dishId,
  nutritionClass,
  reviewNote,
});

export const PRIMARY_PROFILE_MAPPINGS = [
  released(
    "dish.poached-chicken-rice",
    "Steamed chicken rice",
    "meal",
    "The reviewed steamed-chicken serving is the closest source match for the game's poached chicken rice.",
    "curated-synonym",
  ),
  released(
    "dish.roast-chicken-rice",
    "Roasted chicken rice",
    "meal",
    "The source uses roasted rather than roast in the food name.",
    "curated-synonym",
  ),
  unavailable(
    "dish.soya-tofu-rice",
    "No source row represents the game's complete soya-tofu rice serving.",
  ),
  released(
    "dish.chicken-congee",
    "Chicken porridge",
    "meal",
    "Singapore source terminology uses porridge for the game's chicken congee.",
    "curated-synonym",
  ),
  released(
    "dish.nasi-lemak",
    "Nasi lemak (chicken wing set)",
    "meal",
    "The chicken-wing set matches the default plated game recipe.",
    "curated-synonym",
  ),
  released("dish.mee-rebus", "Mee rebus", "meal", "Exact named dish match."),
  released("dish.soto-ayam", "Soto ayam", "meal", "Exact named dish match."),
  unavailable(
    "dish.lontong-sayur",
    "No reviewed row matches the game's full lontong sayur composition.",
  ),
  released("dish.kopi", "Kopi", "drink", "Exact hot kopi serving match."),
  released(
    "dish.sugarcane-juice",
    "Fresh sugarcane juice",
    "drink",
    "The source adds the preparation descriptor fresh.",
    "curated-synonym",
  ),
  released("dish.ice-kacang", "Ice kacang", "meal", "Exact named dessert match."),
  released(
    "dish.char-kway-teow",
    "Char kway teow",
    "meal",
    "Exact named dish match.",
  ),
  unavailable(
    "dish.hokkien-prawn-mee",
    "No reviewed row matches the game's Hokkien prawn mee serving.",
  ),
  released(
    "dish.fried-carrot-cake",
    "Fried carrot cake (white)",
    "meal",
    "White carrot cake is the game's default recipe; black is available as a reviewed variant.",
    "curated-synonym",
  ),
  released(
    "dish.oyster-omelette",
    "Oyster omelette",
    "meal",
    "Exact named dish match.",
  ),
  released(
    "dish.roti-prata",
    "Plain prata (2 pc, with curry)",
    "meal",
    "The source serving matches the game's two-piece prata plate with curry.",
    "curated-synonym",
  ),
  released(
    "dish.mee-goreng-mamak",
    "Mee goreng",
    "meal",
    "The source row is the reviewed local mee goreng preparation.",
    "curated-synonym",
  ),
  released(
    "dish.chicken-murtabak",
    "Murtabak (chicken)",
    "meal",
    "The source expresses the protein as a parenthetical variant.",
    "curated-synonym",
  ),
  released(
    "dish.nasi-briyani",
    "Nasi briyani (chicken)",
    "meal",
    "Chicken is the game's default briyani protein.",
    "curated-synonym",
  ),
  released(
    "dish.masala-thosai",
    "Masala thosai",
    "meal",
    "Exact named dish match.",
  ),
  released(
    "dish.idli-sambar",
    "Idli",
    "meal",
    "The reviewed source serving description includes the accompaniments represented by the game.",
    "curated-synonym",
  ),
  unavailable(
    "dish.vadai-set",
    "The available source serving does not represent the game's full vadai set.",
  ),
  unavailable(
    "dish.lemon-rice",
    "No reviewed source row matches the game's lemon-rice serving and sides.",
  ),
  unavailable(
    "dish.nyonya-laksa",
    "No reviewed row matches the game's Nyonya laksa composition.",
  ),
  unavailable(
    "dish.ayam-buah-keluak",
    "No reviewed row matches the game's ayam buah keluak composition.",
  ),
  unavailable(
    "dish.chap-chye",
    "No reviewed row matches the game's complete chap chye serving.",
  ),
  unavailable(
    "dish.babi-pongteh",
    "The source row is a 100 g component basis rather than the game's plated meal.",
  ),
  released(
    "dish.sambal-stingray",
    "Sambal stingray",
    "meal",
    "Exact named dish match.",
  ),
  released(
    "dish.sliced-fish-soup",
    "Sliced fish beehoon soup (no milk)",
    "meal",
    "The no-milk beehoon preparation matches the default game bowl.",
    "curated-synonym",
  ),
  unavailable(
    "dish.black-pepper-crab",
    "The available source basis represents a component portion rather than the game's shared crab platter.",
  ),
  released(
    "dish.bak-chor-mee",
    "Bak chor mee (dry)",
    "meal",
    "Dry is the game's default noodle preparation.",
    "curated-synonym",
  ),
  released(
    "dish.fishball-mee-pok",
    "Fishball noodles (dry)",
    "meal",
    "The reviewed dry fishball-noodle serving matches the game's mee pok presentation.",
    "curated-synonym",
  ),
  released("dish.lor-mee", "Lor mee", "meal", "Exact named dish match."),
  unavailable(
    "dish.teochew-fish-dumpling-soup",
    "No reviewed row matches the game's Teochew fish-dumpling soup bowl.",
  ),
  released("dish.chendol", "Chendol", "meal", "Exact named dessert match."),
  unavailable(
    "dish.tau-huay",
    "No reviewed row matches the game's tau huay serving.",
  ),
  released(
    "dish.teh-tarik",
    "Teh Tarik",
    "drink",
    "Exact named drink match with source capitalization retained in provenance.",
  ),
  released(
    "dish.pulut-hitam",
    "Pulut hitam",
    "meal",
    "Exact named dessert match.",
  ),
  unavailable(
    "dish.chicken-satay-set",
    "The source does not provide a reviewed complete chicken satay set matching the game's portion and sides.",
  ),
  unavailable(
    "dish.bbq-chicken-wings",
    "No reviewed row matches the game's barbecue chicken-wing portion and preparation.",
  ),
  unavailable(
    "dish.beef-satay-set",
    "The source does not provide a reviewed complete beef satay set matching the game's portion and sides.",
  ),
  unavailable(
    "dish.sambal-grilled-squid",
    "No reviewed row matches the game's sambal grilled-squid serving.",
  ),
  unavailable(
    "dish.har-gow",
    "The available source basis does not match the game's basket portion.",
  ),
  released("dish.siew-mai", "Siew mai", "meal", "Exact named dim sum match."),
  released(
    "dish.char-siew-bao",
    "Char siew pau",
    "meal",
    "The source reports one pau; values are scaled to the game's three-piece basket.",
    "scaled-exact",
    3,
    "3 pieces (168 g)",
  ),
  unavailable(
    "dish.lotus-leaf-rice",
    "No reviewed row matches the game's lotus-leaf rice parcel.",
  ),
];

const variant = (
  id,
  name,
  foodName,
  unlockRank,
  visualKey,
  reviewNote,
  mappingKind = "exact",
) => ({
  id,
  name,
  foodName,
  unlockRank,
  visualKey,
  reviewNote,
  mappingKind,
});

export const VARIANT_FAMILY_MAPPINGS = [
  {
    dishId: "dish.kopi",
    defaultVariantId: "kopi-default",
    variants: [
      variant("kopi-default", "Kopi", "Kopi", 1, "kopi-milk-sugar-standard", "Default hot kopi serving."),
      variant("kopi-siu-dai", "Kopi siu dai", "Kopi siu dai", 2, "kopi-milk-one-sugar", "Reduced-sugar kopi variant."),
      variant("kopi-c", "Kopi C", "Kopi C", 4, "kopi-evaporated-milk-two-sugar", "Kopi with evaporated milk."),
      variant("kopi-c-kosong", "Kopi C kosong", "Kopi C kosong", 7, "kopi-evaporated-milk-no-sugar", "Kopi C without added sugar."),
      variant("kopi-o", "Kopi O", "Kopi O", 7, "kopi-black-two-sugar", "Black kopi with sugar."),
      variant("kopi-o-kosong", "Kopi O kosong", "Kopi O kosong", 7, "kopi-black-no-sugar", "Black kopi without added sugar."),
    ],
  },
  {
    dishId: "dish.teh-tarik",
    defaultVariantId: "teh-tarik",
    variants: [
      variant("teh-tarik", "Teh Tarik", "Teh Tarik", 1, "teh-pulled-foam", "Default pulled tea serving."),
      variant("teh", "Teh", "Teh", 2, "teh-milk-sugar-standard", "Standard hot milk tea."),
      variant("teh-siu-dai", "Teh siu dai", "Teh siu dai", 4, "teh-milk-one-sugar", "Reduced-sugar tea variant."),
      variant("teh-c", "Teh C", "Teh C", 7, "teh-evaporated-milk-two-sugar", "Tea with evaporated milk."),
      variant("teh-c-kosong", "Teh C kosong", "Teh C kosong", 7, "teh-evaporated-milk-no-sugar", "Teh C without added sugar."),
      variant("teh-o", "Teh O", "Teh O", 7, "teh-black-two-sugar", "Black tea with sugar."),
      variant("teh-o-kosong", "Teh O kosong", "Teh O kosong", 7, "teh-black-no-sugar", "Black tea without added sugar."),
    ],
  },
  {
    dishId: "dish.nasi-lemak",
    defaultVariantId: "nasi-lemak-chicken-wing",
    variants: [
      variant("nasi-lemak-chicken-wing", "Chicken wing set", "Nasi lemak (chicken wing set)", 1, "nasi-wing", "Default chicken-wing set."),
      variant("nasi-lemak-chicken-cutlet", "Chicken cutlet set", "Nasi lemak (chicken cutlet set)", 2, "nasi-cutlet", "Chicken-cutlet set."),
      variant("nasi-lemak-wing-cutlet", "Wing and cutlet set", "Nasi lemak (chicken wing and chicken cutlet set)", 4, "nasi-wing-cutlet", "Larger set with both chicken preparations."),
      variant("nasi-lemak-egg-ikan-bilis-peanut", "Egg, ikan bilis and peanut set", "Nasi lemak (egg, ikan bilis, peanut set)", 7, "nasi-egg-ikan-bilis-peanut", "Set centred on egg, ikan bilis and peanuts."),
      variant("nasi-lemak-fish", "Fish set", "Nasi lemak (fish set)", 7, "nasi-fish", "Fish set."),
      variant("nasi-lemak-rice-only", "Coconut rice only", "Nasi lemak (rice only)", 7, "nasi-rice-only", "Rice-only source serving; presented as a portion-size trade-off, not a complete-meal recommendation."),
    ],
  },
  {
    dishId: "dish.fried-carrot-cake",
    defaultVariantId: "carrot-cake-white",
    variants: [
      variant("carrot-cake-white", "White carrot cake", "Fried carrot cake (white)", 1, "carrot-cake-white-egg", "Default white preparation."),
      variant("carrot-cake-black", "Black carrot cake", "Fried carrot cake (black)", 2, "carrot-cake-black-sauce", "Sweet dark-soy preparation."),
    ],
  },
  {
    dishId: "dish.roti-prata",
    defaultVariantId: "prata-two-plain-curry",
    variants: [
      variant("prata-two-plain-curry", "Two plain prata with curry", "Plain prata (2 pc, with curry)", 1, "prata-two-curry", "Default two-piece plate with curry."),
      variant("prata-plain", "Plain prata", "Plain prata", 2, "prata-single-plain", "Single plain prata source serving."),
      variant("prata-egg", "Egg prata", "Prata (egg)", 4, "prata-egg-centre", "Egg-filled prata."),
      variant("prata-egg-onion", "Egg and onion prata", "Prata (egg, onion)", 7, "prata-egg-onion", "Egg-and-onion prata."),
      variant("prata-egg-onion-cheese", "Egg, onion and cheese prata", "Prata (egg, onion, cheese)", 7, "prata-egg-onion-cheese", "Egg, onion and cheese prata."),
    ],
  },
  {
    dishId: "dish.sliced-fish-soup",
    defaultVariantId: "fish-soup-beehoon-no-milk",
    variants: [
      variant("fish-soup-beehoon-no-milk", "Fish beehoon, no milk", "Sliced fish beehoon soup (no milk)", 1, "fish-beehoon-clear", "Default clear soup with beehoon."),
      variant("fish-soup-beehoon-milk", "Fish beehoon with milk", "Sliced fish beehoon soup (with milk)", 2, "fish-beehoon-milky", "Milky soup with beehoon."),
      variant("fish-soup-sliced-no-milk", "Sliced fish soup, no milk", "Sliced fish soup (no milk)", 4, "fish-slices-clear", "Clear sliced-fish soup without noodles."),
      variant("fish-soup-sliced-milk", "Sliced fish soup with milk", "Sliced fish soup (with milk)", 7, "fish-slices-milky", "Milky sliced-fish soup without noodles."),
    ],
  },
  {
    dishId: "dish.bak-chor-mee",
    defaultVariantId: "bak-chor-mee-dry",
    variants: [
      variant("bak-chor-mee-dry", "Bak chor mee, dry", "Bak chor mee (dry)", 1, "bak-chor-dry-sauce", "Default dry preparation."),
      variant("bak-chor-mee-soup", "Bak chor mee soup", "Bak chor mee (soup)", 2, "bak-chor-broth", "Soup preparation."),
    ],
  },
  {
    dishId: "dish.chicken-murtabak",
    defaultVariantId: "murtabak-chicken",
    variants: [
      variant("murtabak-chicken", "Chicken murtabak", "Murtabak (chicken)", 1, "murtabak-chicken", "Default chicken filling."),
      variant("murtabak-chicken-mushroom-cheese", "Chicken, mushroom and cheese murtabak", "Murtabak (chicken, mushroom, cheese)", 2, "murtabak-chicken-mushroom-cheese", "Larger chicken, mushroom and cheese serving."),
      variant("murtabak-mutton", "Mutton murtabak", "Murtabak (mutton)", 4, "murtabak-mutton", "Mutton filling."),
      variant("murtabak-vegetable", "Vegetable murtabak", "Murtabak (vegetable)", 7, "murtabak-vegetable", "Vegetable filling; the label does not imply dietary certification."),
    ],
  },
  {
    dishId: "dish.nasi-briyani",
    defaultVariantId: "briyani-chicken",
    variants: [
      variant("briyani-chicken", "Chicken briyani", "Nasi briyani (chicken)", 1, "briyani-chicken", "Default chicken serving."),
      variant("briyani-fish-prawn", "Fish or prawn briyani", "Nasi briyani (fish or prawn)", 2, "briyani-fish-prawn", "Seafood serving; the source groups fish and prawn together."),
      variant("briyani-mutton", "Mutton briyani", "Nasi briyani (mutton)", 4, "briyani-mutton", "Mutton serving."),
      variant("briyani-vegetable", "Vegetable briyani", "Nasi briyani (vegetable)", 7, "briyani-vegetable", "Vegetable serving; the label does not imply dietary certification."),
    ],
  },
  {
    dishId: "dish.masala-thosai",
    defaultVariantId: "thosai-masala",
    variants: [
      variant("thosai-masala", "Masala thosai", "Masala thosai", 1, "thosai-masala-fold", "Default masala-filled serving."),
      variant("thosai-plain", "Plain thosai", "Thosai", 2, "thosai-plain-roll", "Plain thosai serving."),
      variant("thosai-egg", "Egg thosai", "Thosai (egg)", 4, "thosai-egg-centre", "Egg thosai serving."),
      variant("thosai-ghee", "Ghee thosai", "Thosai (ghee)", 7, "thosai-ghee-gloss", "Ghee thosai serving."),
    ],
  },
];

export const NUTRITION_INTENTS = [
  {
    id: "lighter-energy",
    name: "Lighter energy",
    description: "Prefers a lower-energy meal among reviewed in-game options.",
    metric: "energyKcal",
    direction: "lower",
    nutritionClass: "meal",
  },
  {
    id: "protein-forward",
    name: "Protein-forward",
    description: "Prefers a higher-protein meal among reviewed in-game options.",
    metric: "proteinG",
    direction: "higher",
    nutritionClass: "meal",
  },
  {
    id: "fibre-forward",
    name: "Fibre-forward",
    description: "Prefers a higher-fibre meal among reviewed in-game options.",
    metric: "dietaryFibreG",
    direction: "higher",
    nutritionClass: "meal",
  },
  {
    id: "sodium-aware",
    name: "Sodium-aware",
    description: "Prefers a lower-sodium meal among reviewed in-game options.",
    metric: "sodiumMg",
    direction: "lower",
    nutritionClass: "meal",
  },
  {
    id: "lower-total-sugar-drink",
    name: "Lower-total-sugar drink",
    description: "Prefers a lower-total-sugar drink among reviewed in-game options.",
    metric: "totalSugarG",
    direction: "lower",
    nutritionClass: "drink",
  },
];

export const NUTRITION_DISCLOSURE =
  "Hawker Balance is an educational game, not medical or dietary advice. Nutrition values describe the listed serving in the source data; recipes and portions vary. Daily reference ranges are general guidance for Singaporean adults and do not represent individual needs. Total sugar is not the same as added sugar. In Hawker Balance, balance means comparing trade-offs—not labelling a dish good or bad.";
