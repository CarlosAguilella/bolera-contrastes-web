// Bolera Contrastes — datos del local
// Sirve como base para Home, Carta y Reservar. Realista para Onda (Castelló).

window.BC_INFO = {
  name: "Bolera Contrastes",
  tagline: "Pub · Cafetería · 1x2 · Cervecería · Comida temática",
  address: "Carrer del Ceramista Abad, 9",
  city: "12200 Onda (Castelló)",
  phone: "+34964771290",
  phonePretty: "964 77 12 90",
  whatsapp: "+34964771290", // mismo número, en producción podría diferir
  mapsUrl: "https://maps.google.com/?q=Carrer+del+Ceramista+Abad+9+Onda",
  facebookUrl: "https://facebook.com/boleracontrastes",
  hours: [
    { days: "Lun",       open: "08:00", close: "23:00", dayIdx: [1] },
    { days: "Mar–Jue",   open: "08:00", close: "23:00", dayIdx: [2,3,4] },
    { days: "Vie–Sáb",   open: "08:00", close: "01:00", dayIdx: [5,6] },
    { days: "Domingo",   closed: true, dayIdx: [0] },
  ],
};

// 5 conceptos del local — para la sección "todo en uno"
window.BC_CONCEPTS = [
  {
    id: "pub",
    name: "Pub",
    blurb: "Cañas, vinos y picoteo hasta la madrugada los findes.",
    when: "A partir de las 19:00",
    hue: 0,
  },
  {
    id: "cafe",
    name: "Cafetería",
    blurb: "Desayunos, meriendas y café de especialidad todo el día.",
    when: "Desde las 8:00",
    hue: 1,
  },
  {
    id: "apuestas",
    name: "Apuestas 1x2",
    blurb: "Quinielas, fútbol y carreras en pantalla grande.",
    when: "Partidos en directo",
    hue: 2,
  },
  {
    id: "cerveceria",
    name: "Cervecería",
    blurb: "Tirador frío, artesanas rotativas y pinchos para acompañar.",
    when: "Todos los días",
    hue: 3,
  },
  {
    id: "tematica",
    name: "Comida temática",
    blurb: "Noches de paella, mexicano, hamburguesas gourmet y más.",
    when: "Consulta agenda",
    hue: 4,
  },
];

// Próximos eventos — fechas relativas para que parezcan vivas
window.BC_EVENTS = [
  {
    id: "paella-30may",
    title: "Paella valenciana",
    subtitle: "Domingo de paella — leña y socarrat",
    date: "DOM 31 MAY",
    time: "14:00",
    price: "15 €/persona",
    spots: "8 plazas libres",
    tag: "Comida temática",
    img: "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=800&q=70",
  },
  {
    id: "futbol-eurocopa",
    title: "España vs. Inglaterra",
    subtitle: "Final Eurocopa en pantalla gigante",
    date: "DOM 7 JUN",
    time: "21:00",
    price: "Entrada libre",
    spots: "Reserva mesa",
    tag: "Pub · 1x2",
    img: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=70",
  },
  {
    id: "burger-night",
    title: "Burger Night",
    subtitle: "Smash burgers, IPA y patatas trufadas",
    date: "VIE 12 JUN",
    time: "20:30",
    price: "Carta especial",
    spots: "Sin reserva",
    tag: "Comida temática",
    img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=70",
  },
  {
    id: "cata-cerveza",
    title: "Cata de artesanas",
    subtitle: "5 cervezas locales con maridaje",
    date: "JUE 18 JUN",
    time: "19:30",
    price: "18 €/persona",
    spots: "12 plazas",
    tag: "Cervecería",
    img: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=70",
  },
];

// Alérgenos en formato chip — 14 oficiales UE simplificados a los que aplican aquí
window.BC_ALLERGENS = {
  G:  { short: "G",  label: "Gluten" },
  L:  { short: "L",  label: "Lácteos" },
  H:  { short: "H",  label: "Huevo" },
  P:  { short: "P",  label: "Pescado" },
  M:  { short: "M",  label: "Marisco" },
  FS: { short: "FS", label: "Frutos secos" },
  S:  { short: "S",  label: "Soja" },
  SU: { short: "SU", label: "Sulfitos" },
  MO: { short: "MO", label: "Mostaza" },
  AP: { short: "AP", label: "Apio" },
};

// Carta — datos realistas para un bar/cafetería en Castellón
window.BC_MENU = [
  // ===== PARA PICAR =====
  { id: "p1", cat: "picar", name: "Croquetas de la abuela", desc: "Bechamel cremosa de jamón ibérico (6 ud).", price: 7.5, allergens: ["G","L","H"], veg: false,
    img: "https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=600&q=70" },
  { id: "p2", cat: "picar", name: "Patatas bravas", desc: "Patata gajo, brava casera y alioli suave.", price: 6.5, allergens: ["H"], veg: true,
    img: "https://images.unsplash.com/photo-1639024471283-03518883512d?w=600&q=70" },
  { id: "p3", cat: "picar", name: "Tabla ibérica", desc: "Jamón, lomo, chorizo y queso curado con pan tostado.", price: 14.5, allergens: ["G","L"], veg: false,
    img: "https://images.unsplash.com/photo-1452195100486-9cc805987862?w=600&q=70" },
  { id: "p4", cat: "picar", name: "Calamares a la andaluza", desc: "Calamar fresco rebozado y limón.", price: 9.5, allergens: ["G","M"], veg: false,
    img: "https://images.unsplash.com/photo-1599321955726-fa9eee29c0ed?w=600&q=70" },
  { id: "p5", cat: "picar", name: "Ensaladilla rusa", desc: "Receta de la casa con atún y huevo.", price: 7.0, allergens: ["P","H"], veg: false,
    img: "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=70" },
  { id: "p6", cat: "picar", name: "Hummus con verduras", desc: "Garbanzo, tahini y crudités de temporada.", price: 6.5, allergens: ["FS"], veg: true,
    img: "https://images.unsplash.com/photo-1571197119282-7c4e4a4dabbd?w=600&q=70" },

  // ===== BOCADILLOS Y TOSTAS =====
  { id: "b1", cat: "bocas", name: "Tosta de salmón", desc: "Salmón ahumado, aguacate y eneldo sobre pan de masa madre.", price: 8.5, allergens: ["G","P","L"], veg: false,
    img: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&q=70" },
  { id: "b2", cat: "bocas", name: "Bocadillo de calamares", desc: "Clásico madrileño con alioli de limón.", price: 7.5, allergens: ["G","M","H"], veg: false,
    img: "https://images.unsplash.com/photo-1626700050361-d36c61d57c10?w=600&q=70" },
  { id: "b3", cat: "bocas", name: "Bikini trufado", desc: "Jamón cocido, queso fundido y aceite de trufa.", price: 6.5, allergens: ["G","L"], veg: false,
    img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&q=70" },
  { id: "b4", cat: "bocas", name: "Tosta vegana", desc: "Hummus, tomate seco, rúcula y semillas.", price: 7.0, allergens: ["G","FS"], veg: true,
    img: "https://images.unsplash.com/photo-1565299543923-37dd37887442?w=600&q=70" },

  // ===== HAMBURGUESAS =====
  { id: "h1", cat: "burgers", name: "Smash Contrastes", desc: "Doble carne, cheddar, cebolla caramelizada y salsa de la casa.", price: 12.5, allergens: ["G","L","H","MO"], veg: false,
    img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=70" },
  { id: "h2", cat: "burgers", name: "Crispy Chicken", desc: "Pollo crujiente, miel-mostaza y pepinillos.", price: 11.5, allergens: ["G","L","H","MO"], veg: false,
    img: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=600&q=70" },
  { id: "h3", cat: "burgers", name: "Veggie Beet", desc: "Hamburguesa de remolacha y quinoa, mayo vegana.", price: 11.0, allergens: ["G","S"], veg: true,
    img: "https://images.unsplash.com/photo-1525059696034-4967a729002e?w=600&q=70" },

  // ===== COMIDA TEMÁTICA =====
  { id: "t1", cat: "tematica", name: "Paella valenciana", desc: "Arroz bomba, pollo, conejo, garrofó y ferraúra. Mín. 2 pers.", price: 15.0, allergens: [], veg: false,
    img: "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600&q=70" },
  { id: "t2", cat: "tematica", name: "Fideuà de marisco", desc: "Fideo fino, gambas, sepia y allioli negro.", price: 16.0, allergens: ["G","M","H"], veg: false,
    img: "https://images.unsplash.com/photo-1633436375005-b89d6fbd5f5f?w=600&q=70" },
  { id: "t3", cat: "tematica", name: "Tacos al pastor", desc: "Cerdo marinado, piña, cilantro y cebolla morada (3 ud).", price: 9.5, allergens: ["G"], veg: false,
    img: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=70" },
  { id: "t4", cat: "tematica", name: "Pizza margherita", desc: "Masa madre 48h, tomate San Marzano y mozzarella fior di latte.", price: 10.0, allergens: ["G","L"], veg: true,
    img: "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=600&q=70" },

  // ===== ENSALADAS =====
  { id: "e1", cat: "ensaladas", name: "César de pollo", desc: "Pollo a la plancha, parmesano, picatostes y salsa César.", price: 10.5, allergens: ["G","L","H","P"], veg: false,
    img: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600&q=70" },
  { id: "e2", cat: "ensaladas", name: "Burrata y tomate", desc: "Burrata fresca, tomate de la huerta y albahaca.", price: 11.0, allergens: ["L"], veg: true,
    img: "https://images.unsplash.com/photo-1608032077018-c9aad9565d29?w=600&q=70" },

  // ===== DESAYUNOS =====
  { id: "d1", cat: "desayunos", name: "Tostada con tomate", desc: "Pan de pueblo, tomate rallado y AOVE.", price: 3.5, allergens: ["G"], veg: true,
    img: "https://images.unsplash.com/photo-1565599837634-134bc3aadce8?w=600&q=70" },
  { id: "d2", cat: "desayunos", name: "Bowl de açaí", desc: "Açaí, plátano, granola casera y miel.", price: 7.5, allergens: ["G","FS","L"], veg: true,
    img: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=600&q=70" },
  { id: "d3", cat: "desayunos", name: "Huevos benedict", desc: "Muffin inglés, huevo pochado, bacon y holandesa.", price: 9.0, allergens: ["G","L","H"], veg: false,
    img: "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&q=70" },

  // ===== CAFÉS Y BEBIDAS =====
  { id: "c1", cat: "cafe", name: "Café solo", desc: "Café de especialidad — origen Brasil.", price: 1.5, allergens: [], veg: true,
    img: "https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=600&q=70" },
  { id: "c2", cat: "cafe", name: "Flat white", desc: "Doble espresso con leche texturizada.", price: 2.8, allergens: ["L"], veg: true,
    img: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&q=70" },
  { id: "c3", cat: "cafe", name: "Matcha latte", desc: "Matcha ceremonial y leche de avena.", price: 4.0, allergens: ["L"], veg: true,
    img: "https://images.unsplash.com/photo-1536013455834-d2ab1bd9def8?w=600&q=70" },

  // ===== CERVEZAS Y CÓCTELES =====
  { id: "cv1", cat: "cervezas", name: "Caña de tirador", desc: "Estrella Galicia bien fría.", price: 2.2, allergens: ["G","SU"], veg: true,
    img: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&q=70" },
  { id: "cv2", cat: "cervezas", name: "IPA local 'Onda'", desc: "Artesana de Castellón, lúpulo cítrico.", price: 4.5, allergens: ["G","SU"], veg: true,
    img: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=70" },
  { id: "cv3", cat: "cocteles", name: "Gin tonic premium", desc: "Tu ginebra + tónica y botánicos.", price: 8.5, allergens: ["SU"], veg: true,
    img: "https://images.unsplash.com/photo-1551734322-2f7c34d49ee2?w=600&q=70" },
  { id: "cv4", cat: "cocteles", name: "Spritz Aperol", desc: "Aperol, prosecco, soda y naranja.", price: 7.0, allergens: ["SU"], veg: true,
    img: "https://images.unsplash.com/photo-1605270012917-bf357a1fae9e?w=600&q=70" },

  // ===== POSTRES =====
  { id: "po1", cat: "postres", name: "Coulant de chocolate", desc: "Bizcocho tibio con corazón fundido y helado.", price: 5.5, allergens: ["G","L","H"], veg: true,
    img: "https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=600&q=70" },
  { id: "po2", cat: "postres", name: "Tarta de queso", desc: "Estilo La Viña — cremosa y quemada.", price: 4.8, allergens: ["L","H"], veg: true,
    img: "https://images.unsplash.com/photo-1542826438-bd32f43d626f?w=600&q=70" },
];

window.BC_CATEGORIES = [
  { id: "all",       label: "Todo" },
  { id: "desayunos", label: "Desayunos" },
  { id: "picar",     label: "Para picar" },
  { id: "bocas",     label: "Tostas & bocas" },
  { id: "burgers",   label: "Hamburguesas" },
  { id: "ensaladas", label: "Ensaladas" },
  { id: "tematica",  label: "Temática" },
  { id: "postres",   label: "Postres" },
  { id: "cafe",      label: "Cafés" },
  { id: "cervezas",  label: "Cervezas" },
  { id: "cocteles",  label: "Cócteles" },
];
