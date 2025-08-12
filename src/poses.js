export const POSES = [
  // ——— symmetry (quarter turns) ———
  { id: "front_relaxed", label: "Front Relaxed", category: "symmetry", hasSide: false, aliases: ["front pose"] },
  { id: "side_relaxed", label: "Side Relaxed", category: "symmetry", hasSide: false, aliases: ["side pose"] },
  { id: "back_relaxed", label: "Back Relaxed", category: "symmetry", hasSide: false, aliases: ["back pose", "rear relaxed"] },

  // ——— classic physique mandatory (WNBF Canada) ———
  // Source: WNBF Canada Classic Physique: Front DB, Side Chest, Side Triceps, Rear DB, Ab & Thigh, plus 2 favourite poses. :contentReference[oaicite:1]{index=1}
  { id: "front_double_biceps", label: "Front Double Biceps", category: "muscularity", hasSide: false },
  { id: "side_chest_left", label: "Side Chest (left)", category: "muscularity", hasSide: false, base: "side_chest", side: "left" },
  { id: "side_chest_right", label: "Side Chest (right)", category: "muscularity", hasSide: false, base: "side_chest", side: "right" },
  { id: "side_triceps_left", label: "Side Triceps (left)", category: "muscularity", hasSide: false, base: "side_triceps", side: "left" },
  { id: "side_triceps_right", label: "Side Triceps (right)", category: "muscularity", hasSide: false, base: "side_triceps", side: "right" },
  { id: "back_double_biceps", label: "Back Double Biceps", category: "muscularity", hasSide: false },
  { id: "abdominals_and_thigh", label: "Abdominals and Thigh", category: "muscularity", hasSide: false },

  // ——— optional practice (from Bodybuilding list; not Classic-Physique mandatory) ———
  // “Most Muscular” is BODYBUILDING mandatory at WNBF Canada; include it for training if you want, but your Classic class won’t necessarily call it. :contentReference[oaicite:2]{index=2}
  { id: "most_muscular", label: "Most Muscular (optional)", category: "practice_optional", hasSide: false, note: "Bodybuilding mandatory; optional in Classic Physique practice." },

  // ——— classic favourites (examples WNBF Canada + GymToStage article) ———
  // WNBF Canada lists examples for your 2 favourite poses: Rear Twisted DB, Vacuum, Archer, Victory, Teacup. :contentReference[oaicite:3]{index=3}
  // GymToStage expands classic favourites like Crucifix, Mantis, 3/4 Biceps, Rear Lat & Biceps variants, etc. :contentReference[oaicite:4]{index=4}
  { id: "vacuum", label: "Vacuum", category: "favourite", hasSide: false, aliases: ["stomach vacuum"] },
  { id: "victory", label: "Victory Pose", category: "favourite", hasSide: false },
  { id: "teacup", label: "Teacup", category: "favourite", hasSide: false },
  { id: "crucifix", label: "Crucifix", category: "favourite", hasSide: false },
  { id: "archer", label: "Archer", category: "favourite", hasSide: false },

  // “Twisted Back Double”/“Arnold” style
  { id: "twisted_back_double", label: "Twisted Back Double", category: "favourite", hasSide: false, aliases: ["Arnold back double", "3/4 rear biceps"] },

  // additional favourites from the article
  { id: "mantis", label: "Mantis", category: "favourite", hasSide: false },
  { id: "three_quarter_front_biceps", label: "Three-Quarter Front Biceps", category: "favourite", hasSide: false },
  { id: "three_quarter_back_biceps", label: "Three-Quarter Back Biceps", category: "favourite", hasSide: false },
  { id: "rear_lat_and_biceps", label: "Rear Lat and Biceps (one up/one down)", category: "favourite", hasSide: false },
  { id: "side_lunge_crucifix", label: "Side-Lunge Crucifix", category: "favourite", hasSide: false },
  { id: "side_lunge_front_double", label: "Side-Lunge Front Double", category: "favourite", hasSide: false },
  { id: "front_atlas", label: "Front Atlas", category: "favourite", hasSide: false },
  { id: "back_atlas", label: "Back Atlas", category: "favourite", hasSide: false },
  { id: "kneeling_front_biceps", label: "Kneeling Front Biceps", category: "favourite", hasSide: false },
  { id: "kneeling_gargoyle", label: "Kneeling Gargoyle", category: "favourite", hasSide: false },

  // clarification: you mentioned “seradas”
  // I’ve added a Serratus-focused favourite; if you meant a different named pose, we can rename easily in the UI.
  { id: "serratus_flex", label: "Serratus Flex", category: "favourite", hasSide: false, aliases: ["serratus", "intercostal crunch"] }
];

// helper to look up a sideable base id from left/right ids (optional)
export const SIDE_MAP = {
  side_chest_left: { base: "side_chest", side: "left" },
  side_chest_right: { base: "side_chest", side: "right" },
  side_triceps_left: { base: "side_triceps", side: "left" },
  side_triceps_right: { base: "side_triceps", side: "right" }
};
