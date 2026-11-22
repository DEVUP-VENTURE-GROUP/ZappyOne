// Specialist Home Services, the most booked work in depth: more jobs on the first seven services and nine new ones; prices are starting suggestions, each partner sets their own.
const { ONE, at, job } = require('./helpers');

const extend = {
  pest_control: [
    job('termite', 'Termite treatment (drill and inject)', 180, at(2999, 3999, 4999, 6499), 'Inspection first|Drill-fill-seal at walls|1-year service warranty'),
    job('mosquito', 'Mosquito control spray and fogging', 60, at(799, 999, 1199, 1499), 'Indoor spray|Balcony and drains|Odourless, safe'),
    job('rodent', 'Rat and rodent control', 60, at(999, 1199, 1399, 1799), 'Entry points checked|Baits and traps|Follow-up visit'),
    job('ants_spiders', 'Ants, lizards and spiders treatment', 45, at(599, 699, 799, 999), 'Gel and spray|Corners and kitchen|Safe for children'),
    job('woodborer', 'Wood borer treatment for furniture', 90, at(1499, 1799, 2199, 2699), 'Holes injected|Furniture coated|Repeat in 3 months advised'),
    job('amc', 'Pest control yearly plan, 3 visits', 60, at(2499, 2999, 3499, 4499), 'Cockroach and ants|Three visits a year|Free call-backs'),
  ],
  sofa_mattress: [
    job('sofa_5', 'Sofa shampoo, 5 seats', 90, 1199, 'Vacuum and shampoo|Stain treatment|Dries in 4 to 6 hours'),
    job('sofa_leather', 'Leather sofa cleaning and conditioning', 90, 1299, 'Gentle cleaner|Leather conditioner|No water damage'),
    job('dining_chairs', 'Dining chairs shampoo, 6 chairs', 60, 699, 'Fabric seats shampooed|Frames wiped|Quick dry'),
    job('cushions_curtains', 'Cushions and curtain dry vacuum', 45, 499, 'Up to 10 cushions|Curtains vacuumed in place|Dust mites reduced'),
    job('car_seats', 'Car seat shampoo', 90, 1199, 'All seats|Floor mats|Quick dry'),
    job('rug', 'Rug or carpet deep shampoo, up to 6x9 ft', 90, 999, 'Vacuum|Shampoo and rinse|Spot stains'),
  ],
  gardening: [
    job('balcony_garden', 'Balcony garden setup, up to 10 pots', 120, 1499, 'Pots, soil and plants planned with you|Potting done|Watering plan'),
    job('fertilise', 'Manure and fertiliser for all plants', 45, 349, 'Organic manure|Soil loosened|Watering after'),
    job('hedge', 'Hedge trimming and shaping', 90, 799, 'Shaped and trimmed|Waste bagged|Area swept'),
  ],
  painting: [
    job('room_paint', 'One room painting, walls only', 480, 4999, 'Putty patch-up|Two coats emulsion|Furniture covered'),
    job('ceiling_paint', 'Ceiling painting, one room', 180, 1499, 'Scrape loose paint|Two coats|Floor covered'),
    job('texture', 'Texture or accent wall, one wall', 300, 3499, 'Design of your choice|Primer and texture|Clean-up'),
    job('door_polish', 'Door and window polish or enamel, per door', 120, 899, 'Sanding|Polish or enamel|Two coats'),
  ],
  home_inspection: [
    job('electrical_check', 'Electrical safety check', 60, at(799, 999, 1199, 1499), 'Earthing and wiring|Sockets and MCBs|Written findings'),
    job('seepage_check', 'Seepage and damp check with moisture meter', 60, at(699, 899, 1099, 1299), 'Moisture meter readings|Source of leak|Fix suggested'),
  ],
  specialty_cleaning: [
    job('blinds', 'Blinds cleaning, up to 4', 60, 599, 'Slats wiped one by one|Dust removed|Cords checked'),
    job('glass_facade', 'Shop glass front cleaning', 60, 699, 'Inside and outside|Streak-free|Frames wiped'),
  ],
};

const lines = [
  { code: 'waterproofing', prefix: 'wproof', name: 'Waterproofing & leakage repair', domainCode: 'specialist_home', icon: 'Droplets', thing: 'job', types: ONE, isPopular: true,
    packages: [
      job('inspect', 'Leak inspection and waterproofing quote', 45, 299, 'Find the source|Photos and readings|Fixed quote'),
      job('terrace', 'Terrace waterproofing, up to 500 sq ft', 480, 14999, 'Cracks filled|Waterproof coating|5-year warranty on work'),
      job('bathroom', 'Bathroom waterproofing without breaking tiles', 240, 4999, 'Grout sealing|Chemical injection|Leak test'),
      job('wall_seepage', 'Wall seepage treatment, one wall', 240, 3499, 'Damp plaster treated|Waterproof primer|Ready for paint'),
      job('tank', 'Water tank waterproofing', 240, 3999, 'Tank cleaned and dried|Coating inside|Leak test'),
      job('crack_fill', 'Wall and terrace crack filling', 120, 1499, 'Cracks opened and filled|Sealant|Finish'),
    ] },
  { code: 'bird_netting', prefix: 'birdnet', name: 'Pigeon nets & bird spikes', domainCode: 'specialist_home', icon: 'ShieldCheck', thing: 'balcony', types: ONE, isPopular: true,
    packages: [
      job('balcony_net', 'Balcony pigeon net, up to 100 sq ft', 120, 1999, 'UV-safe nylon net|Hooks and wire frame|Neat finish'),
      job('duct_net', 'Duct or shaft netting', 120, 2499, 'Full shaft covered|Steel wire frame|Safe access'),
      job('spikes', 'Bird spikes, up to 20 ft', 60, 1499, 'Polycarbonate spikes|AC units and ledges|No harm to birds'),
      job('ss_net', 'Stainless steel invisible grill, per 10 sq ft', 120, 2999, 'Child-safe|Strong steel wire|Clean look'),
      job('net_repair', 'Net repair or replacement visit', 60, 599, 'Torn net fixed|Hooks tightened|Area cleaned'),
      job('droppings', 'Pigeon droppings cleaning and sanitising', 60, 799, 'Droppings scraped|Disinfected|Balcony washed'),
    ] },
  { code: 'mosquito_mesh', prefix: 'mesh', name: 'Mosquito mesh & window screens', domainCode: 'specialist_home', icon: 'Bug', thing: 'window', types: ONE,
    packages: [
      job('sliding', 'Sliding window mesh, per window', 60, 1499, 'Aluminium frame|Fibreglass mesh|Fitted to size'),
      job('velcro', 'Velcro mesh, per window', 30, 499, 'Washable mesh|Velcro frame|Easy to remove'),
      job('pleated', 'Pleated door mesh', 90, 3499, 'Folds away|Smooth track|Pet-resistant option'),
      job('magnetic', 'Magnetic door curtain', 20, 399, 'Hands-free closing|Fitted to frame|Washable'),
      job('roller', 'Roller mesh, per window', 60, 1999, 'Rolls up when not needed|Aluminium box|Fitted'),
      job('mesh_repair', 'Mesh repair or replacement', 45, 399, 'Torn mesh replaced|Frame checked|Clean finish'),
    ] },
  { code: 'floor_polishing', prefix: 'flpolish', name: 'Marble, granite & wood floor polishing', domainCode: 'specialist_home', icon: 'Sparkle', thing: 'floor', types: ONE,
    packages: [
      job('marble_visit', 'Floor polishing visit and quote', 30, 199, 'Floor checked|Sample patch|Fixed quote'),
      job('marble_100', 'Marble polishing, per 100 sq ft', 180, 2499, 'Grinding and diamond polish|Crystallisation|Mirror finish'),
      job('granite_100', 'Granite polishing, per 100 sq ft', 150, 1999, 'Polish and buff|Stain removal|Sealant'),
      job('wood_100', 'Wooden floor sanding and polish, per 100 sq ft', 240, 3499, 'Sanding|Two coats of polish|Dust-controlled'),
      job('kota_tile', 'Kota or mosaic floor polish, per 100 sq ft', 150, 1499, 'Grinding|Polish|Sealant'),
      job('stairs', 'Staircase marble polish, up to 15 steps', 240, 3999, 'Every step and edge|Polish|Anti-slip care'),
    ] },
  { code: 'false_ceiling', prefix: 'fceil', name: 'False ceiling & POP work', domainCode: 'specialist_home', icon: 'PaintRoller', thing: 'room', types: ONE,
    packages: [
      job('visit', 'False ceiling design visit and quote', 45, 299, 'Measurements|Design options|Fixed quote'),
      job('gypsum_100', 'Gypsum false ceiling, per 100 sq ft', 480, 8999, 'Gypsum boards and frame|Cove lights planned|Finish ready to paint'),
      job('pop_100', 'POP false ceiling, per 100 sq ft', 600, 9999, 'POP design|Smooth finish|Ready to paint'),
      job('pvc_100', 'PVC ceiling panels, per 100 sq ft', 360, 7499, 'Waterproof panels|Good for bathrooms and balconies|No painting needed'),
      job('repair', 'False ceiling crack or sag repair', 120, 1499, 'Cracks and joints fixed|Sag supported|Patch painted'),
      job('lights_cutouts', 'Light cut-outs in existing ceiling, up to 6', 90, 999, 'Neat cut-outs|Wiring path made|Dust cleaned'),
    ] },
  { code: 'tiling', prefix: 'tiling', name: 'Tiling & flooring work', domainCode: 'specialist_home', icon: 'Hammer', thing: 'floor', types: ONE,
    packages: [
      job('visit', 'Tiling visit and quote', 45, 299, 'Measurements|Tile advice|Fixed quote'),
      job('replace_few', 'Replace broken tiles, up to 5', 120, 999, 'Old tiles removed|New tiles fixed (tiles extra)|Grout matched'),
      job('floor_100', 'Floor tiling, per 100 sq ft (tiles extra)', 480, 4999, 'Levelling|Tiles laid|Grouting'),
      job('wall_100', 'Wall tiling, per 100 sq ft (tiles extra)', 480, 5499, 'Plaster check|Tiles fixed|Grouting'),
      job('epoxy_grout', 'Epoxy grout refill, per 100 sq ft', 240, 2999, 'Old grout raked out|Stain-proof epoxy|Clean finish'),
      job('skirting', 'Skirting tiles, per room', 180, 1499, 'Old skirting removed|New fixed|Grouted'),
    ] },
  { code: 'blinds_curtains', prefix: 'blinds', name: 'Curtains, blinds & rods installation', domainCode: 'specialist_home', icon: 'Home', thing: 'window', types: ONE,
    packages: [
      job('rods', 'Curtain rod installation, per window', 30, 249, 'Drilling and brackets|Level fitting|Dust cleaned'),
      job('blinds', 'Roller or zebra blinds installation, per window', 45, 349, 'Brackets fitted|Blind hung and tested|Cords secured'),
      job('tracks', 'Ceiling curtain track installation, per window', 45, 399, 'Track fixed to ceiling|Runners and hooks|Smooth slide'),
      job('measure', 'Measurement visit for curtains and blinds', 30, 149, 'Every window measured|Fabric and type advice|Written sizes'),
      job('motorised', 'Motorised curtain or blind setup', 90, 1499, 'Motor fixed|Remote or app paired|Tested'),
      job('remove_refit', 'Remove and refit curtains and rods, whole home', 120, 699, 'Taken down for wash|Refitted after|Rods tightened'),
    ] },
  { code: 'solar_care', prefix: 'solarc', name: 'Solar panel & water heater service', domainCode: 'specialist_home', icon: 'Zap', thing: 'system', types: ONE,
    packages: [
      job('panel_clean', 'Solar panel cleaning, up to 10 panels', 60, 599, 'Soft brush and water|No scratches|Output checked'),
      job('panel_check', 'Solar system health check', 60, 799, 'Inverter and wiring|Output measured|Written findings'),
      job('heater_service', 'Solar water heater service', 90, 999, 'Tank descaled|Pipes checked|Leaks fixed'),
      job('heater_repair', 'Solar water heater repair visit', 60, 499, 'Problem found|Repair quoted|Small fixes done'),
      job('amc', 'Solar panel cleaning, 6 visits a year', 60, 2999, 'One visit every 2 months|Up to 10 panels|Output log'),
      job('bird_guard', 'Bird guard mesh around panels', 120, 2499, 'Stops pigeons nesting|Clips, no drilling|Neat finish'),
    ] },
  { code: 'window_film', prefix: 'wfilm', name: 'Window film & glass work', domainCode: 'specialist_home', icon: 'Sparkle', thing: 'window', types: ONE,
    packages: [
      job('sun_film', 'Sun control window film, per 10 sq ft', 45, 599, 'Cuts heat and glare|Bubble-free|Clean edges'),
      job('frosted', 'Frosted privacy film, per 10 sq ft', 45, 499, 'Privacy for bathrooms|Light still comes in|Bubble-free'),
      job('glass_replace', 'Broken window glass replacement, per pane', 60, 799, 'Measured and cut|Fitted with beading|Old glass removed'),
      job('mirror_fit', 'Mirror fitting', 45, 499, 'Wall drilled|Clips or adhesive|Level fixing'),
      job('shower_partition', 'Glass shower partition, visit and quote', 45, 299, 'Measurements|Glass options|Fixed quote'),
      job('film_remove', 'Old film removal, per 10 sq ft', 30, 299, 'Film peeled|Glue removed|Glass cleaned'),
    ] },
];

module.exports = { extend, lines };
