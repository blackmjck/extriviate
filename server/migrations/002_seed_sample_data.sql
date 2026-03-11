-- Extriviate — Sample Data Seed
-- Inserts a system seed user, 10 categories, 100 questions, and 100 answers.
-- Safe to run multiple times: the seed user insert uses ON CONFLICT.

BEGIN;

DO $$
DECLARE
  v_user_id INTEGER;
  v_cat     INTEGER;
  v_q       INTEGER;
BEGIN

  -- ── Seed user ──────────────────────────────────────────────────────────────
  -- A non-login system account that owns all seeded content.
  -- INSERT INTO users (email, display_name, password_hash, role)
  -- VALUES ('seed@extriviate.internal', 'Extriviate Seed', '$seed$not-a-real-password-hash', 'admin')
  -- ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
  -- RETURNING id INTO v_user_id;
  v_user_id := 7;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 1. World geography
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'World geography') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This river is often called the longest in the world, flowing through northeastern Africa."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Nile"}]', ARRAY['The Nile', 'Nile']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This continent is the largest by both land area and population."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Asia"}]', ARRAY['Asia']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This country contains more than half of the world''s lakes."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Canada"}]', ARRAY['Canada']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Strait of Gibraltar separates Europe from this continent."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Africa"}]', ARRAY['Africa']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This tiny landlocked nation is completely surrounded by Italy."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Vatican City"}]', ARRAY['Vatican City', 'the Vatican']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Amazon River empties into this ocean."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Atlantic Ocean"}]', ARRAY['The Atlantic Ocean', 'Atlantic Ocean', 'the Atlantic']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This African country has the most pyramids in the world — more than Egypt."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Sudan"}]', ARRAY['Sudan']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Lake Baikal, the world''s deepest lake, is located in this country."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Russia"}]', ARRAY['Russia']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This narrow strip of land connects North and South America."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Isthmus of Panama"}]', ARRAY['The Isthmus of Panama', 'Isthmus of Panama', 'Panama']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Dasht-e Lut in this country is one of the hottest places on Earth''s surface."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Iran"}]', ARRAY['Iran']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 2. Famous scientists
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Famous scientists') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"He developed the theory of general relativity."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Albert Einstein"}]', ARRAY['Albert Einstein', 'Einstein']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This woman was the first to win two Nobel Prizes, in Physics and Chemistry."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Marie Curie"}]', ARRAY['Marie Curie', 'Curie']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"He described natural selection as the mechanism of evolution in \"On the Origin of Species.\""}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Charles Darwin"}]', ARRAY['Charles Darwin', 'Darwin']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This English scientist formulated the laws of motion and universal gravitation."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Isaac Newton"}]', ARRAY['Isaac Newton', 'Newton']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"She is credited with writing the first computer algorithm in the 1840s."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Ada Lovelace"}]', ARRAY['Ada Lovelace', 'Lovelace', 'Ada Byron']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This scientist discovered penicillin accidentally in 1928."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Alexander Fleming"}]', ARRAY['Alexander Fleming', 'Fleming']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"He proposed that the universe is expanding, based on observations of distant galaxies."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Edwin Hubble"}]', ARRAY['Edwin Hubble', 'Hubble']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This physicist developed the first nuclear reactor, Chicago Pile-1, in 1942."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Enrico Fermi"}]', ARRAY['Enrico Fermi', 'Fermi']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"She mapped the ocean floor and her work directly contributed to the theory of plate tectonics."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Marie Tharp"}]', ARRAY['Marie Tharp', 'Tharp']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 9th-century Persian mathematician gave us the word \"algebra\" through his landmark text."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Al-Khwarizmi"}]', ARRAY['Al-Khwarizmi', 'al-Khwarizmi', 'Muhammad ibn Musa al-Khwarizmi']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 3. Classic literature
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Classic literature') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Shakespeare play features the line \"To be or not to be.\""}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Hamlet"}]', ARRAY['Hamlet']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This novel by Mary Shelley, about a scientist and his monstrous creation, is often called the first sci-fi novel."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Frankenstein"}]', ARRAY['Frankenstein', 'Frankenstein; or, The Modern Prometheus']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Russian author wrote both \"War and Peace\" and \"Anna Karenina.\""}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Leo Tolstoy"}]', ARRAY['Leo Tolstoy', 'Tolstoy', 'Lev Tolstoy']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Homer''s epic poem following Odysseus on his decade-long journey home from Troy."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Odyssey"}]', ARRAY['The Odyssey', 'Odyssey']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Dickens novel opens with \"It was the best of times, it was the worst of times.\""}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"A Tale of Two Cities"}]', ARRAY['A Tale of Two Cities', 'Tale of Two Cities']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The protagonist of Cervantes'' novel who famously tilts at windmills."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Don Quixote"}]', ARRAY['Don Quixote', 'Don Quijote']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 14th-century collection of stories is framed as a group of pilgrims entertaining each other on the road to Canterbury."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Canterbury Tales"}]', ARRAY['The Canterbury Tales', 'Canterbury Tales']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This novella by Joseph Conrad follows a voyage into the African interior and explores the darkness of colonialism."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Heart of Darkness"}]', ARRAY['Heart of Darkness']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 18th-century Chinese novel, one of the Four Great Classical Novels, follows the Jia family''s decline."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Dream of the Red Chamber"}]', ARRAY['Dream of the Red Chamber', 'Story of the Stone', 'Hongloumeng']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This epistolary novel by Samuel Richardson, published in 1740, is often cited as one of the first true English novels."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Pamela"}]', ARRAY['Pamela', 'Pamela; or, Virtue Rewarded']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 4. US history
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'US history') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"He was the first President of the United States."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"George Washington"}]', ARRAY['George Washington', 'Washington']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 1803 land deal roughly doubled the size of the United States."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Louisiana Purchase"}]', ARRAY['The Louisiana Purchase', 'Louisiana Purchase']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"She refused to give up her bus seat in Montgomery, Alabama in 1955, sparking a major civil rights boycott."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Rosa Parks"}]', ARRAY['Rosa Parks', 'Parks']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This constitutional amendment, ratified in 1865, abolished slavery."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The 13th Amendment"}]', ARRAY['The 13th Amendment', '13th Amendment', 'Thirteenth Amendment']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The bloodiest single-day battle of the Civil War, fought in September 1862 in Maryland."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Battle of Antietam"}]', ARRAY['The Battle of Antietam', 'Battle of Antietam', 'Antietam', 'Battle of Sharpsburg']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 1944 operation was the largest seaborne invasion in history."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"D-Day (Operation Overlord)"}]', ARRAY['D-Day', 'Operation Overlord', 'D-Day (Operation Overlord)']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This act, passed in 1830 under Andrew Jackson, forcibly relocated Native American tribes west of the Mississippi."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Indian Removal Act"}]', ARRAY['The Indian Removal Act', 'Indian Removal Act']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"He was the only US president to serve two non-consecutive terms."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Grover Cleveland"}]', ARRAY['Grover Cleveland', 'Cleveland']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 1919 Senate vote blocked US entry into the League of Nations, largely at the urging of this Massachusetts senator."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Henry Cabot Lodge"}]', ARRAY['Henry Cabot Lodge', 'Lodge']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Triangle Shirtwaist Factory fire of 1911 occurred in this New York City borough."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Manhattan"}]', ARRAY['Manhattan']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 5. The animal kingdom
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'The animal kingdom') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The largest land animal on Earth."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The African elephant"}]', ARRAY['The African elephant', 'African elephant', 'elephant']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The only mammal capable of true, sustained flight."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The bat"}]', ARRAY['The bat', 'bat', 'bats']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This deep-sea creature has three hearts, blue blood, and eight arms."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The octopus"}]', ARRAY['The octopus', 'octopus']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The world''s fastest land animal, capable of reaching 70 mph."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The cheetah"}]', ARRAY['The cheetah', 'cheetah']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This flightless bird lays the largest eggs of any living bird species."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The ostrich"}]', ARRAY['The ostrich', 'ostrich']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"A group of flamingos is collectively known by this name."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"A flamboyance"}]', ARRAY['A flamboyance', 'flamboyance']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This animal has the longest gestation period of any land mammal, at nearly two years."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The elephant"}]', ARRAY['The elephant', 'elephant', 'African elephant']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The mimic octopus, discovered in 1998, is native to the waters off this Southeast Asian island nation."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Indonesia"}]', ARRAY['Indonesia']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This small mammal is the only known animal besides humans to show signs of altruistic behavior toward non-relatives in the wild, observed in meerkats and this species."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The naked mole-rat"}]', ARRAY['The naked mole-rat', 'naked mole-rat', 'naked mole rat']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The pistol shrimp stuns prey by snapping its claw to create a cavitation bubble that briefly reaches this temperature — hotter than the sun''s surface."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"~8,000°F (4,400°C)"}]', ARRAY['~8,000°F (4,400°C)', '8000 degrees', '4400 degrees Celsius', '8000°F']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 6. Famous artworks
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Famous artworks') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Leonardo da Vinci painted this famously enigmatic, smiling portrait."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Mona Lisa"}]', ARRAY['The Mona Lisa', 'Mona Lisa', 'La Gioconda']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Van Gogh''s swirling nighttime landscape over a quiet village is called this."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Starry Night"}]', ARRAY['The Starry Night', 'Starry Night']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Edvard Munch''s iconic painting depicting a figure with an anguished, open-mouthed expression."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Scream"}]', ARRAY['The Scream', 'Scream']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Grant Wood''s 1930 painting depicting a stern farmer and woman standing before a Gothic-style farmhouse."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"American Gothic"}]', ARRAY['American Gothic']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Vermeer painting, sometimes called the \"Mona Lisa of the North,\" features a girl with a glowing earring."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Girl with a Pearl Earring"}]', ARRAY['Girl with a Pearl Earring']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Salvador Dalí''s most famous work depicts melting clocks draped over a barren landscape."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Persistence of Memory"}]', ARRAY['The Persistence of Memory', 'Persistence of Memory']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Raphael fresco, painted in the Vatican, depicts Plato and Aristotle surrounded by the great thinkers of antiquity."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The School of Athens"}]', ARRAY['The School of Athens', 'School of Athens']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Jacques-Louis David painted this dramatic 1784 scene of Roman soldiers pledging their lives to the state."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Oath of the Horatii"}]', ARRAY['The Oath of the Horatii', 'Oath of the Horatii']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 12th-century Japanese handscroll painting, attributed to Tokiwa Mitsunaga, depicts scenes from the four seasons and court life."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Annual Rites and Ceremonies scroll (Nenjū Gyōji Emaki)"}]', ARRAY['The Annual Rites and Ceremonies scroll', 'Nenjū Gyōji Emaki', 'Nenchu Gyoji Emaki']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Théodore Géricault''s massive 1819 painting depicting survivors adrift on a raft was inspired by this real-life French naval disaster."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Raft of the Medusa"}]', ARRAY['The Raft of the Medusa', 'Raft of the Medusa']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 7. Science & the natural world
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Science & the natural world') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The most abundant gas in Earth''s atmosphere."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Nitrogen"}]', ARRAY['Nitrogen']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The process by which plants convert sunlight and CO₂ into food."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Photosynthesis"}]', ARRAY['Photosynthesis']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This is the hardest natural substance on Earth."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Diamond"}]', ARRAY['Diamond']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The planet with the most known moons in our solar system."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Saturn"}]', ARRAY['Saturn']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The SI unit of electrical resistance, named after a German physicist."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Ohm"}]', ARRAY['The Ohm', 'Ohm', 'ohm']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This element, atomic number 80, is the only metal that is liquid at room temperature."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Mercury"}]', ARRAY['Mercury', 'quicksilver']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Coriolis effect causes storms to rotate in opposite directions in the northern and southern hemispheres due to this phenomenon."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Earth''s rotation"}]', ARRAY['Earth''s rotation', 'the rotation of the Earth', 'Earth rotating']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This law states that the pressure of a gas is inversely proportional to its volume at constant temperature."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Boyle''s Law"}]', ARRAY['Boyle''s Law', 'Boyles Law']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This principle in quantum mechanics states that the position and momentum of a particle cannot both be precisely known simultaneously."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Heisenberg Uncertainty Principle"}]', ARRAY['The Heisenberg Uncertainty Principle', 'Heisenberg Uncertainty Principle', 'uncertainty principle']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Chandrasekhar limit defines the maximum mass of this type of stellar remnant before it collapses further."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"A white dwarf"}]', ARRAY['A white dwarf', 'white dwarf', 'white dwarf star']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 8. Food & cuisine
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Food & cuisine') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Italian pasta dish is made with eggs, Pecorino Romano, guanciale, and black pepper."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Carbonara"}]', ARRAY['Carbonara', 'pasta carbonara']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This spice, made from dried crocus stigmas, is the world''s most expensive by weight."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Saffron"}]', ARRAY['Saffron']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Maillard reaction is the chemical process responsible for this common cooking effect."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Browning (of food)"}]', ARRAY['Browning (of food)', 'browning', 'food browning']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Japanese fermented soybean paste forms the base of one of Japan''s most iconic soups."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Miso"}]', ARRAY['Miso']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"A croissant''s origins trace not to France but to this country, in the form of a pastry called the kipferl."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Austria"}]', ARRAY['Austria']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This West African grain, a staple crop for centuries, is naturally gluten-free and highly drought-resistant."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Sorghum"}]', ARRAY['Sorghum']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This French mother sauce is the base for Mornay, Soubise, and several other classic derivatives."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Béchamel"}]', ARRAY['Béchamel', 'Bechamel', 'béchamel sauce']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Scoville scale measures capsaicin concentration; this pepper held the world record for heat from 2013 to 2017."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"The Carolina Reaper"}]', ARRAY['The Carolina Reaper', 'Carolina Reaper']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This traditional Peruvian dish, considered the country''s national dish, consists of raw fish cured in citrus juice with onions and chili."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Ceviche"}]', ARRAY['Ceviche', 'cebiche', 'seviche']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The culinary term \"en papillote\" describes cooking food sealed inside this material."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Parchment paper"}]', ARRAY['Parchment paper', 'parchment', 'baking paper']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 9. Music history
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'Music history') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This composer wrote the Fifth Symphony and \"Für Elise\" while losing his hearing."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Ludwig van Beethoven"}]', ARRAY['Ludwig van Beethoven', 'Beethoven']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Known as the \"King of Rock and Roll,\" he recorded early hits at Sun Studio in Memphis."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Elvis Presley"}]', ARRAY['Elvis Presley', 'Elvis']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Beatles album, named for a London recording studio, features the iconic barefoot-crossing cover photo."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Abbey Road"}]', ARRAY['Abbey Road']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This American jazz trumpeter and vocalist was nicknamed \"Satchmo\" and was one of the defining figures of jazz."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Louis Armstrong"}]', ARRAY['Louis Armstrong', 'Armstrong', 'Satchmo']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This Italian Baroque composer wrote \"The Four Seasons\" and was a prolific teacher in Venice."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Antonio Vivaldi"}]', ARRAY['Antonio Vivaldi', 'Vivaldi']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The 1969 Woodstock festival was held not in Woodstock but in this nearby New York town."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Bethel"}]', ARRAY['Bethel', 'Bethel, New York']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This genre, originating in 1970s New York, is widely considered the first form of hip-hop music."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"DJing / DJ culture (or breakbeat DJing)"}]', ARRAY['DJing', 'DJ culture', 'breakbeat DJing', 'turntablism']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"Robert Johnson, a foundational blues musician, is said to have made a deal with the devil at a crossroads in this US state."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Mississippi"}]', ARRAY['Mississippi']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This 20th-century composer pioneered the \"prepared piano\" by inserting objects between the strings."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"John Cage"}]', ARRAY['John Cage', 'Cage']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Rite of Spring, whose 1913 Paris premiere famously incited a riot, was composed by this Russian composer."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Igor Stravinsky"}]', ARRAY['Igor Stravinsky', 'Stravinsky']);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 10. World mythology
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO categories (creator_id, name) VALUES (v_user_id, 'World mythology') RETURNING id INTO v_cat;

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"In Greek mythology, this figure flew too close to the sun on wings of feathers and wax."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Icarus"}]', ARRAY['Icarus']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Norse god of thunder, whose name gives English its word for Thursday."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Thor"}]', ARRAY['Thor']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"In Egyptian mythology, this jackal-headed god presided over the dead and the weighing of souls."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Anubis"}]', ARRAY['Anubis']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Greek hero who slew the Minotaur in the Labyrinth of Crete."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Theseus"}]', ARRAY['Theseus']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"This trickster figure in Norse mythology could shape-shift and was the father of monsters including the Midgard Serpent."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Loki"}]', ARRAY['Loki']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"In Aztec mythology, this feathered serpent deity was associated with wind, knowledge, and the morning star."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Quetzalcoatl"}]', ARRAY['Quetzalcoatl', 'Quetzalcoátl']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The hero of the world''s oldest surviving epic poem, who sought immortality after the death of his companion Enkidu."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Gilgamesh"}]', ARRAY['Gilgamesh']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"In Hindu mythology, this god of destruction and transformation is part of the Trimurti alongside Brahma and Vishnu."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Shiva"}]', ARRAY['Shiva', 'Siva']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"In Yoruba mythology, this deity of the crossroads and fate serves as the intermediary between humans and the divine."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Eshu (or Elegba)"}]', ARRAY['Eshu', 'Elegba', 'Eshu (or Elegba)', 'Exu', 'Legba']);

  INSERT INTO questions (creator_id, category_id, content) VALUES (v_user_id, v_cat, '[{"type":"text","value":"The Finnish national epic, compiled by Elias Lönnrot in 1835, is centered on this mythological hero and shamanistic smith."}]') RETURNING id INTO v_q;
  INSERT INTO answers (question_id, content, accepted_answers) VALUES (v_q, '[{"type":"text","value":"Väinämöinen (from the Kalevala)"}]', ARRAY['Väinämöinen', 'Vainamoinen', 'Väinämöinen (from the Kalevala)']);

END $$;

COMMIT;
