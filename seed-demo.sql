-- =====================================================================
-- HobbyNest — starter catalog (demo content)
-- =====================================================================
-- Adds 6 sample educators, 21 classes across every category (each with
-- lessons and real YouTube video lectures) and 5 upcoming meetups in Mumbai,
-- so Explore, search and Nearby Meetups aren't empty on launch.
--
-- HOW TO RUN: run database.sql first, then paste this whole file into the
-- Supabase SQL Editor → Run. Safe to re-run: nothing is duplicated, and
-- meetups that already happened are replaced with new upcoming dates.
--
-- The sample educators are fictional accounts with no password — nobody can
-- log in as them. Their emails end in .example (a reserved, unusable domain).
-- To remove ALL demo content later, run remove-demo.sql.
--
-- Video lectures are public YouTube lessons, credited to their channels in
-- each lecture title and class description.
-- =====================================================================

-- 1. Sample educator accounts (auth user → profile is created by the
--    handle_new_user trigger from database.sql).
do $$
declare
    e jsonb;
begin
    for e in select * from jsonb_array_elements($seed$[
 {
  "key": "ananya",
  "id": "5eed0000-0000-4000-a000-000000000001",
  "name": "Ananya Iyer",
  "headline": "Dance educator · Bollywood, hip hop & contemporary",
  "city": "Mumbai",
  "lat": 19.0596,
  "lng": 72.8295,
  "bio": "I've taught dance to complete beginners for eight years — from office teams to retirees. My classes are about having fun first; technique follows.",
  "experience": "8 years teaching dance",
  "interests": [
   "Dance",
   "Fitness",
   "Music"
  ],
  "email": "ananya@demo.hobbynest.example"
 },
 {
  "key": "kabir",
  "id": "5eed0000-0000-4000-a000-000000000002",
  "name": "Kabir Malhotra",
  "headline": "Guitar, ukulele & keyboard teacher",
  "city": "Pune",
  "lat": 18.5204,
  "lng": 73.8567,
  "bio": "Session musician turned teacher. I help adults who 'always wanted to learn an instrument' play their first song within a week.",
  "experience": "10 years playing, 6 years teaching",
  "interests": [
   "Music",
   "Songwriting"
  ],
  "email": "kabir@demo.hobbynest.example"
 },
 {
  "key": "meera",
  "id": "5eed0000-0000-4000-a000-000000000003",
  "name": "Meera Joshi",
  "headline": "Artist · watercolour, sketching & embroidery",
  "city": "Mumbai",
  "lat": 19.0176,
  "lng": 72.8562,
  "bio": "Illustrator and art-journal addict. I believe everyone can draw — it's a skill, not a talent — and I teach it step by step.",
  "experience": "Illustrator, 7 years teaching",
  "interests": [
   "Art",
   "Craft & DIY"
  ],
  "email": "meera@demo.hobbynest.example"
 },
 {
  "key": "rohan",
  "id": "5eed0000-0000-4000-a000-000000000004",
  "name": "Rohan Desai",
  "headline": "Photographer · phone & camera basics",
  "city": "Bengaluru",
  "lat": 12.9716,
  "lng": 77.5946,
  "bio": "Travel and street photographer. I teach how to see light and frame a shot — whether you have a DSLR or just your phone.",
  "experience": "Professional photographer, 5 years teaching",
  "interests": [
   "Photography",
   "Travel"
  ],
  "email": "rohan@demo.hobbynest.example"
 },
 {
  "key": "sana",
  "id": "5eed0000-0000-4000-a000-000000000005",
  "name": "Sana Qureshi",
  "headline": "Software engineer · beginner-friendly coding",
  "city": "Delhi",
  "lat": 28.6139,
  "lng": 77.209,
  "bio": "Full-stack developer who started coding at 24 with zero background. I teach programming the way I wish I'd been taught: small wins, real projects.",
  "experience": "Software engineer, 4 years mentoring",
  "interests": [
   "Programming",
   "Technology"
  ],
  "email": "sana@demo.hobbynest.example"
 },
 {
  "key": "tara",
  "id": "5eed0000-0000-4000-a000-000000000006",
  "name": "Tara Fernandes",
  "headline": "Maker & community workshop host",
  "city": "Mumbai",
  "lat": 19.076,
  "lng": 72.8777,
  "bio": "I run community craft circles and speaking clubs. Crochet, origami and good conversation — my favourite ways to bring people together.",
  "experience": "Community organiser, 6 years running workshops",
  "interests": [
   "Craft & DIY",
   "Community"
  ],
  "email": "tara@demo.hobbynest.example"
 }
]$seed$::jsonb)
    loop
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (
            '00000000-0000-0000-0000-000000000000', (e->>'id')::uuid, 'authenticated', 'authenticated',
            e->>'email', '', now(), '', '', '', '',
            '{"provider":"email","providers":["email"],"demo":true}'::jsonb,
            jsonb_build_object('full_name', e->>'name', 'role', 'educator', 'city', e->>'city'),
            now(), now())
        on conflict (id) do nothing;

        insert into public.profiles (id, full_name, email, role, city)
        values ((e->>'id')::uuid, e->>'name', e->>'email', 'educator', e->>'city')
        on conflict (id) do nothing;

        update public.profiles set
            full_name = e->>'name',
            role = 'educator',
            city = e->>'city',
            headline = e->>'headline',
            bio = e->>'bio',
            experience = e->>'experience',
            interests = array(select jsonb_array_elements_text(e->'interests')),
            latitude = (e->>'lat')::double precision,
            longitude = (e->>'lng')::double precision,
            onboarding_complete = true,
            tutorial_completed = true
        where id = (e->>'id')::uuid;
    end loop;
end;
$$;

-- 2. Classes, lessons and YouTube lectures (skipped if the class already exists).
do $$
declare
    c jsonb;
    item jsonb;
    new_id bigint;
    n integer;
begin
    for c in select * from jsonb_array_elements($seed$[
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000001",
  "title": "Bollywood Dance for Beginners",
  "description": "Learn the core Bollywood moves — thumkas, hand gestures and footwork — and put them together into a full song routine. No dance experience needed. Video lectures are hand-picked YouTube lessons from Akshay Bhosale.",
  "category": "Dance",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 999,
  "capacity": 30,
  "location": "Online + Andheri West studio, Mumbai",
  "schedule": "Saturdays · 5:00 PM – 6:30 PM",
  "teaching_format": "Online + In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/SsGtNa3Oo3Y/hqdefault.jpg",
  "lessons": [
   {
    "title": "Warm-up and posture",
    "description": "A 10-minute warm-up you'll use before every practice."
   },
   {
    "title": "12 basic Bollywood moves",
    "description": "Learn the building blocks used in almost every song."
   },
   {
    "title": "Footwork and hand gestures",
    "description": "Combine steps with expressive hands and face."
   },
   {
    "title": "Your first full routine",
    "description": "Put it all together on a short song section."
   }
  ],
  "lectures": [
   {
    "title": "12 Basic Bollywood Dance Moves | Beginner Level | ABDC — Akshay Bhosale",
    "youtube_url": "https://www.youtube.com/watch?v=SsGtNa3Oo3Y"
   },
   {
    "title": "Basic Bollywood Dance Steps | In English for Beginners | Step 2 — Akshay Bhosale",
    "youtube_url": "https://www.youtube.com/watch?v=F-oCfYHPGtw"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000001",
  "title": "Hip Hop Dance Foundations",
  "description": "Grooves, bounce, rock and skate — the foundations every hip hop dancer drills. Build rhythm and confidence before you learn choreography. Video lectures are hand-picked YouTube lessons from Hype Dance and Tiana Shern.",
  "category": "Dance",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 799,
  "capacity": 25,
  "location": "Online",
  "schedule": "Wednesdays · 7:30 PM – 8:30 PM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/5SfKtEIKTJo/hqdefault.jpg",
  "lessons": [
   {
    "title": "Finding the beat",
    "description": "Count music in 8s and move on the beat."
   },
   {
    "title": "Basic grooves",
    "description": "Practise the four essential grooves until they feel natural."
   },
   {
    "title": "Bounce, rock and skate drills",
    "description": "Short daily drills that build control."
   },
   {
    "title": "Freestyle minute",
    "description": "Combine grooves into one minute of freestyle."
   }
  ],
  "lectures": [
   {
    "title": "4 BASIC HIP HOP GROOVES - BEGINNER — Hype Dance",
    "youtube_url": "https://www.youtube.com/watch?v=5SfKtEIKTJo"
   },
   {
    "title": "Beginner Hip Hop Tutorial - Drills | Bounce, Rock & Skate ft. Pyro — Tiana Shern",
    "youtube_url": "https://www.youtube.com/watch?v=Io4E--B4QSc"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000001",
  "title": "Contemporary Dance Basics",
  "description": "Fluid, expressive movement for total beginners: a proper warm-up, floor work basics and a short routine you can perform by the end. Video lectures are hand-picked YouTube lessons from BodyKinect by Kendall.",
  "category": "Dance",
  "level": "Beginner",
  "duration": "6 weeks",
  "fee": 1499,
  "capacity": 20,
  "location": "Andheri West studio, Mumbai",
  "schedule": "Sundays · 10:00 AM – 11:30 AM",
  "teaching_format": "In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/uFojmxW_5Dw/hqdefault.jpg",
  "lessons": [
   {
    "title": "Warm-up and stretching",
    "description": "Open up the spine, hips and shoulders safely."
   },
   {
    "title": "Breath and flow",
    "description": "Move with your breath and connect steps smoothly."
   },
   {
    "title": "Floor work basics",
    "description": "Rolls and transitions to and from the floor."
   },
   {
    "title": "Beginner routine",
    "description": "Learn and perform a short contemporary piece."
   }
  ],
  "lectures": [
   {
    "title": "Beginner Contemporary Dance Class- Warm up & Routine — BodyKinect by Kendall",
    "youtube_url": "https://www.youtube.com/watch?v=uFojmxW_5Dw"
   },
   {
    "title": "Total Beginner Contemporary Dance Routine — BodyKinect by Kendall",
    "youtube_url": "https://www.youtube.com/watch?v=H-QVJpZn8bw"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000001",
  "title": "Salsa for Beginners",
  "description": "A free starter course: the salsa basic step, timing on 1, and your first right turn — practise solo now, dance with a partner later. Video lectures are hand-picked YouTube lessons from Salsaventura.",
  "category": "Dance",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 0,
  "capacity": 40,
  "location": "Online",
  "schedule": "Fridays · 8:00 PM – 9:00 PM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/wV8cDpJa2f4/hqdefault.jpg",
  "lessons": [
   {
    "title": "Timing and counting",
    "description": "Hear the 1 and count 1-2-3, 5-6-7."
   },
   {
    "title": "The basic step",
    "description": "Forward and back basic with good posture."
   },
   {
    "title": "Single right turn",
    "description": "Prep, turn and finish on time."
   },
   {
    "title": "Practice playlist",
    "description": "Dance the basic to three songs without stopping."
   }
  ],
  "lectures": [
   {
    "title": "Salsa Beginners 1 - Salsa Basic Step for the Absolute Beginner - Detailed explanation — Salsaventura",
    "youtube_url": "https://www.youtube.com/watch?v=wV8cDpJa2f4"
   },
   {
    "title": "Salsa Beginners 1 - Single Right Turn for the Absolute Beginner - Detailed Explanation — Salsaventura",
    "youtube_url": "https://www.youtube.com/watch?v=p7Ns9DY7U70"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000002",
  "title": "Guitar from Zero",
  "description": "Never held a guitar? Start here. Tuning, holding the guitar, your first chords and a two-chord song by the end of week one. Video lectures are hand-picked YouTube lessons from Andy Guitar.",
  "category": "Music",
  "level": "Beginner",
  "duration": "6 weeks",
  "fee": 1499,
  "capacity": 25,
  "location": "Online + Koregaon Park studio, Pune",
  "schedule": "Sundays · 4:00 PM – 5:30 PM",
  "teaching_format": "Online + In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/BBz-Jyr23M4/hqdefault.jpg",
  "lessons": [
   {
    "title": "Parts of the guitar and tuning",
    "description": "Get set up and tune by ear or with an app."
   },
   {
    "title": "Your first chords",
    "description": "Clean E minor and A minor shapes."
   },
   {
    "title": "Strumming patterns",
    "description": "Down-up strumming in time with a metronome."
   },
   {
    "title": "Your first song",
    "description": "Play a full two-chord song start to finish."
   }
  ],
  "lectures": [
   {
    "title": "Guitar Lesson 1 - Absolute Beginner? Start Here! [Free 10 Day Starter Course] — Andy Guitar",
    "youtube_url": "https://www.youtube.com/watch?v=BBz-Jyr23M4"
   },
   {
    "title": "Guitar Lesson 2 - EASY 2 CHORD SONG & LEAD GUITAR [10 Day Guitar Starter Course] — Andy Guitar",
    "youtube_url": "https://www.youtube.com/watch?v=6Jxz9F3CYuo"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000002",
  "title": "Ukulele in a Weekend",
  "description": "The friendliest instrument to start with. Learn four chords and a simple strum, then play your first full song. Video lectures are hand-picked YouTube lessons from Andy Guitar and The Ukulele Teacher.",
  "category": "Music",
  "level": "Beginner",
  "duration": "2 weeks",
  "fee": 0,
  "capacity": 40,
  "location": "Online",
  "schedule": "Self-paced · live Q&A Saturdays 11:00 AM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/5bTE5fbxDsc/hqdefault.jpg",
  "lessons": [
   {
    "title": "Holding and tuning the ukulele",
    "description": "G-C-E-A tuning and a relaxed grip."
   },
   {
    "title": "C, A minor, F and G",
    "description": "Four chords that unlock hundreds of songs."
   },
   {
    "title": "Simple strumming",
    "description": "A steady down-down-up-up-down-up pattern."
   },
   {
    "title": "Play 'You Are My Sunshine'",
    "description": "Your first complete song."
   }
  ],
  "lectures": [
   {
    "title": "Ukulele Lesson 1 - Absolute Beginner? Start Here! [Free 10 Day Course] — Andy Guitar",
    "youtube_url": "https://www.youtube.com/watch?v=5bTE5fbxDsc"
   },
   {
    "title": "The FIRST song you should learn on the ukulele! (You Are My Sunshine - Easy Tutorial) — The Ukulele Teacher",
    "youtube_url": "https://www.youtube.com/watch?v=GppCKaoSFBQ"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000002",
  "title": "Keyboard & Piano Basics",
  "description": "Find your way around the keys, read basic notes and learn four chords that let you accompany hundreds of songs. Video lectures are hand-picked YouTube lessons from Become a Piano Superhuman and Bill Hilton.",
  "category": "Music",
  "level": "Beginner",
  "duration": "6 weeks",
  "fee": 1299,
  "capacity": 20,
  "location": "Online",
  "schedule": "Tuesdays · 7:00 PM – 8:00 PM",
  "teaching_format": "Online",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/4SXQ_wlbWog/hqdefault.jpg",
  "lessons": [
   {
    "title": "Finding middle C",
    "description": "Learn the layout of black and white keys."
   },
   {
    "title": "Hand position and finger numbers",
    "description": "Play five-finger patterns with both hands."
   },
   {
    "title": "Four essential chords",
    "description": "C, G, A minor and F."
   },
   {
    "title": "Play along",
    "description": "Accompany a song with the four chords."
   }
  ],
  "lectures": [
   {
    "title": "How to Play Piano: Day 1 - EASY First Lesson for Beginners — Become a Piano Superhuman",
    "youtube_url": "https://www.youtube.com/watch?v=4SXQ_wlbWog"
   },
   {
    "title": "Piano chords for beginners: learn four chords to play hundreds of songs — Bill Hilton",
    "youtube_url": "https://www.youtube.com/watch?v=gmvwZRwn-j0"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000003",
  "title": "Watercolour for Beginners",
  "description": "Supplies, washes, wet-on-wet and layering — learn the essential watercolour techniques and paint a simple landscape. Video lectures are hand-picked YouTube lessons from Arteza and Karen Rice Art.",
  "category": "Art",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 1199,
  "capacity": 20,
  "location": "Online + Bandra West studio, Mumbai",
  "schedule": "Saturdays · 11:00 AM – 1:00 PM",
  "teaching_format": "Online + In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/W_XiMalLaa0/hqdefault.jpg",
  "lessons": [
   {
    "title": "Choosing supplies",
    "description": "Paper, brushes and a starter palette on a budget."
   },
   {
    "title": "Flat and graded washes",
    "description": "Control water and pigment for smooth washes."
   },
   {
    "title": "Wet-on-wet and layering",
    "description": "Soft blends and crisp layers."
   },
   {
    "title": "Paint a small landscape",
    "description": "Combine techniques in one finished piece."
   }
  ],
  "lectures": [
   {
    "title": "Watercolor Basics for Beginners: Supplies, Setup & Easy Urban Landscape — Arteza",
    "youtube_url": "https://www.youtube.com/watch?v=W_XiMalLaa0"
   },
   {
    "title": "16 Easy & ESSENTIAL Watercolor Techniques For Beginners — Karen Rice Art",
    "youtube_url": "https://www.youtube.com/watch?v=3V6qEI8gMyY"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000003",
  "title": "Pencil Sketching Fundamentals",
  "description": "A free course on the skill behind all drawing: shading. Learn values, pencil grades and how to make simple shapes look 3D. Video lectures are hand-picked YouTube lessons from RapidFireArt and Drawing & Painting - The Virtual Instructor.",
  "category": "Art",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 0,
  "capacity": 50,
  "location": "Online",
  "schedule": "Self-paced · feedback Thursdays 7:00 PM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/-WR-FyUQc6I/hqdefault.jpg",
  "lessons": [
   {
    "title": "Pencils and value scales",
    "description": "Draw a 5-step value scale with HB to 6B."
   },
   {
    "title": "Shading techniques",
    "description": "Hatching, cross-hatching and blending."
   },
   {
    "title": "Light on basic forms",
    "description": "Shade a sphere, cube and cylinder."
   },
   {
    "title": "Sketch an object from life",
    "description": "Draw a mug or fruit using what you learned."
   }
  ],
  "lectures": [
   {
    "title": "How to Shade with PENCIL for BEGINNERS — RapidFireArt",
    "youtube_url": "https://www.youtube.com/watch?v=-WR-FyUQc6I"
   },
   {
    "title": "How to Shade Basic Forms - Pencil Tutorial — Drawing & Painting - The Virtual Instructor",
    "youtube_url": "https://www.youtube.com/watch?v=vMr6eimcolc"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000003",
  "title": "Acrylic Painting Basics",
  "description": "Bold colour, quick drying and forgiving — acrylics are perfect for beginners. Learn brush handling, blending and finish a canvas. Video lectures are hand-picked YouTube lessons from Art Prof: Your Art School and Jennifer Funnell.",
  "category": "Art",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 1499,
  "capacity": 15,
  "location": "Bandra West studio, Mumbai",
  "schedule": "Sundays · 3:00 PM – 5:00 PM",
  "teaching_format": "In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/CFULyTf-RzM/hqdefault.jpg",
  "lessons": [
   {
    "title": "Supplies and colour mixing",
    "description": "Mix any colour from a limited palette."
   },
   {
    "title": "Brush techniques",
    "description": "Dry brush, stippling and blending."
   },
   {
    "title": "Building layers",
    "description": "Work from background to details."
   },
   {
    "title": "Finish your first canvas",
    "description": "A simple painting you'll be proud to hang."
   }
  ],
  "lectures": [
   {
    "title": "Acrylic Painting for Beginners: Techniques & Supplies — Art Prof: Your Art School",
    "youtube_url": "https://www.youtube.com/watch?v=CFULyTf-RzM"
   },
   {
    "title": "Basic Acrylic Painting Techniques for Beginners — Jennifer Funnell",
    "youtube_url": "https://www.youtube.com/watch?v=Wla7FB3Vrm0"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000003",
  "title": "Hand Embroidery Basics",
  "description": "Learn 15+ basic stitches on a sampler, from running stitch to French knots, and use them to decorate a tote bag or tee. Video lectures are hand-picked YouTube lessons from Mordern craft.",
  "category": "Craft & DIY",
  "level": "Beginner",
  "duration": "3 weeks",
  "fee": 699,
  "capacity": 20,
  "location": "Online",
  "schedule": "Wednesdays · 6:00 PM – 7:00 PM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/EU5GR4EE4XY/hqdefault.jpg",
  "lessons": [
   {
    "title": "Hoop, fabric and thread",
    "description": "Set up your hoop and separate floss."
   },
   {
    "title": "Line stitches",
    "description": "Running, back, stem and chain stitch."
   },
   {
    "title": "Fill and knot stitches",
    "description": "Satin stitch, lazy daisy and French knots."
   },
   {
    "title": "Stitch a sampler",
    "description": "Finish a sampler with all your stitches."
   }
  ],
  "lectures": [
   {
    "title": "15 Basic Hand Embroidery Stitches Sampler For Absolute Beginners — Mordern craft",
    "youtube_url": "https://www.youtube.com/watch?v=EU5GR4EE4XY"
   },
   {
    "title": "20 Basic Hand Embroidery Stitches Sampler for Absolute Beginners — Mordern craft",
    "youtube_url": "https://www.youtube.com/watch?v=hVw1WVacVZo"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000006",
  "title": "Crochet for Absolute Beginners",
  "description": "Slip knot, chain and single crochet — then turn them into your first coaster and a cosy scarf. Video lectures are hand-picked YouTube lessons from Ginger Knots and Hooked & Frayed.",
  "category": "Craft & DIY",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 899,
  "capacity": 20,
  "location": "Online + Bandra community hall, Mumbai",
  "schedule": "Saturdays · 4:00 PM – 5:30 PM",
  "teaching_format": "Online + In-person",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/iWZRqOJifHI/hqdefault.jpg",
  "lessons": [
   {
    "title": "Yarn, hooks and holding",
    "description": "Choose yarn and hold the hook comfortably."
   },
   {
    "title": "Slip knot and chain",
    "description": "Make an even foundation chain."
   },
   {
    "title": "Single crochet rows",
    "description": "Work rows and keep edges straight."
   },
   {
    "title": "Make a coaster",
    "description": "Finish and weave in your ends."
   }
  ],
  "lectures": [
   {
    "title": "How to Crochet for Beginners: slip knot, chain and single crochet — Ginger Knots",
    "youtube_url": "https://www.youtube.com/watch?v=iWZRqOJifHI"
   },
   {
    "title": "How To Crochet For Absolute Beginners — Hooked & Frayed",
    "youtube_url": "https://www.youtube.com/watch?v=DHmr91euoxY"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000006",
  "title": "Origami & Paper Craft",
  "description": "A relaxing free course: learn the basic folds and bases, then fold a classic crane and easy models to gift or decorate with. Video lectures are hand-picked YouTube lessons from BullDinko and Paper Kawaii - Origami Tutorials.",
  "category": "Craft & DIY",
  "level": "Beginner",
  "duration": "2 weeks",
  "fee": 0,
  "capacity": 60,
  "location": "Online",
  "schedule": "Self-paced",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/1vZVygNfpTk/hqdefault.jpg",
  "lessons": [
   {
    "title": "Basic folds",
    "description": "Valley, mountain and squash folds."
   },
   {
    "title": "Easy first models",
    "description": "Fold three simple beginner models."
   },
   {
    "title": "The classic crane",
    "description": "Fold the traditional tsuru step by step."
   },
   {
    "title": "Make a garland",
    "description": "String your models into a decoration."
   }
  ],
  "lectures": [
   {
    "title": "How to Make Easy Origami for Beginners (Step-by-Step Tutorial) — BullDinko",
    "youtube_url": "https://www.youtube.com/watch?v=1vZVygNfpTk"
   },
   {
    "title": "Easy Origami Crane Tutorial - Tsuru - Paper Kawaii — Paper Kawaii - Origami Tutorials",
    "youtube_url": "https://www.youtube.com/watch?v=Ue0dVhO30cw"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000004",
  "title": "Smartphone Photography",
  "description": "Take noticeably better photos with the phone you already have: focus and exposure, composition tricks and simple editing. Video lectures are hand-picked YouTube lessons from Jamie Windsor and Photos with Phones.",
  "category": "Photography",
  "level": "Beginner",
  "duration": "3 weeks",
  "fee": 0,
  "capacity": 60,
  "location": "Online",
  "schedule": "Self-paced · photo walks on weekends",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/_ZYGsx1i5L8/hqdefault.jpg",
  "lessons": [
   {
    "title": "Clean your lens and know your camera app",
    "description": "Focus lock, exposure slider and grid lines."
   },
   {
    "title": "Composition tricks",
    "description": "Leading lines, framing and negative space."
   },
   {
    "title": "Shooting in different light",
    "description": "Golden hour, shade and night mode."
   },
   {
    "title": "Edit one photo three ways",
    "description": "Basic edits in a free app."
   }
  ],
  "lectures": [
   {
    "title": "13 Smartphone Photography tips & tricks — Jamie Windsor",
    "youtube_url": "https://www.youtube.com/watch?v=_ZYGsx1i5L8"
   },
   {
    "title": "7 Mobile Photography Composition Tips — Photos with Phones",
    "youtube_url": "https://www.youtube.com/watch?v=PyE_yQb5XhI"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000004",
  "title": "Camera Basics: The Exposure Triangle",
  "description": "Get off auto mode. Understand aperture, shutter speed and ISO, and how they work together to give you the shot you want. Video lectures are hand-picked YouTube lessons from ExpertPhotography and Vintage Insight Photography.",
  "category": "Photography",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 1499,
  "capacity": 25,
  "location": "Online + Cubbon Park photo walks, Bengaluru",
  "schedule": "Saturdays · 7:00 AM – 9:00 AM",
  "teaching_format": "Online + In-person",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/n0_EF9Empn4/hqdefault.jpg",
  "lessons": [
   {
    "title": "Aperture and depth of field",
    "description": "Blurry backgrounds and sharp landscapes."
   },
   {
    "title": "Shutter speed and motion",
    "description": "Freeze action or show movement."
   },
   {
    "title": "ISO and noise",
    "description": "When to raise ISO and what it costs."
   },
   {
    "title": "Shoot in manual",
    "description": "One photo walk entirely in manual mode."
   }
  ],
  "lectures": [
   {
    "title": "Aperture, Shutter Speed, ISO - The Exposure Triangle Explained — ExpertPhotography",
    "youtube_url": "https://www.youtube.com/watch?v=n0_EF9Empn4"
   },
   {
    "title": "The EXPOSURE TRIANGLE - Understanding ISO, Shutter Speed and Aperture — Vintage Insight Photography",
    "youtube_url": "https://www.youtube.com/watch?v=XrGnPnHm8J8"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000004",
  "title": "Composition & Light",
  "description": "Learn the composition techniques used in published photography — rule of thirds and beyond — and how to read natural light. Video lectures are hand-picked YouTube lessons from Keith Reyes and Sean Gallagher - Pro Photographer.",
  "category": "Photography",
  "level": "Intermediate",
  "duration": "4 weeks",
  "fee": 1299,
  "capacity": 20,
  "location": "Online",
  "schedule": "Thursdays · 8:00 PM – 9:00 PM",
  "teaching_format": "Online",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/FI3Qww1bpvM/hqdefault.jpg",
  "lessons": [
   {
    "title": "Rule of thirds",
    "description": "Place your subject with intention."
   },
   {
    "title": "Five techniques pros use",
    "description": "Layers, framing, juxtaposition and more."
   },
   {
    "title": "Reading natural light",
    "description": "Direction, quality and colour of light."
   },
   {
    "title": "Photo challenge",
    "description": "Shoot and share a 5-photo story."
   }
  ],
  "lectures": [
   {
    "title": "Rule of Thirds - Easy Composition Tips for Photography Beginners — Keith Reyes",
    "youtube_url": "https://www.youtube.com/watch?v=FI3Qww1bpvM"
   },
   {
    "title": "The Classic 'Rule of Thirds’ - 5 Composition Techniques Used in National Geographic Published Photos — Sean Gallagher - Pro Photographer",
    "youtube_url": "https://www.youtube.com/watch?v=dGP0iXEETgg"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000005",
  "title": "Python for Absolute Beginners",
  "description": "A free first course in coding. Install Python, learn variables, conditions, loops and functions, and build small programs. Video lectures are hand-picked YouTube lessons from Programming with Mosh and Corey Schafer.",
  "category": "Programming",
  "level": "Beginner",
  "duration": "6 weeks",
  "fee": 0,
  "capacity": 100,
  "location": "Online",
  "schedule": "Self-paced · live doubt-solving Sundays 6:00 PM",
  "teaching_format": "Online",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/kqtD5dpn9C8/hqdefault.jpg",
  "lessons": [
   {
    "title": "Install Python and write your first program",
    "description": "Set up Python and VS Code, print 'Hello'."
   },
   {
    "title": "Variables and strings",
    "description": "Store and work with text and numbers."
   },
   {
    "title": "If-statements and loops",
    "description": "Make decisions and repeat actions."
   },
   {
    "title": "Mini project: number guessing game",
    "description": "Put everything together in one program."
   }
  ],
  "lectures": [
   {
    "title": "Python for Beginners - Learn Coding with Python in 1 Hour — Programming with Mosh",
    "youtube_url": "https://www.youtube.com/watch?v=kqtD5dpn9C8"
   },
   {
    "title": "Python Tutorial for Beginners 2: Strings - Working with Textual Data — Corey Schafer",
    "youtube_url": "https://www.youtube.com/watch?v=k9TUPpGqYTo"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000005",
  "title": "Build Your First Website: HTML & CSS",
  "description": "Write HTML and CSS from scratch and publish a personal web page — the perfect first step into web development. Video lectures are hand-picked YouTube lessons from Traversy Media.",
  "category": "Programming",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 999,
  "capacity": 50,
  "location": "Online",
  "schedule": "Mondays & Thursdays · 8:00 PM – 9:00 PM",
  "teaching_format": "Online",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/UB1O30fR-EE/hqdefault.jpg",
  "lessons": [
   {
    "title": "How websites work",
    "description": "Files, browsers and your code editor."
   },
   {
    "title": "HTML structure",
    "description": "Headings, text, links, images and lists."
   },
   {
    "title": "Styling with CSS",
    "description": "Colours, fonts, spacing and the box model."
   },
   {
    "title": "Publish your page",
    "description": "Put your personal page online for free."
   }
  ],
  "lectures": [
   {
    "title": "HTML Crash Course For Absolute Beginners — Traversy Media",
    "youtube_url": "https://www.youtube.com/watch?v=UB1O30fR-EE"
   },
   {
    "title": "CSS Crash Course For Absolute Beginners — Traversy Media",
    "youtube_url": "https://www.youtube.com/watch?v=yfoY53QXEnI"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000005",
  "title": "JavaScript Basics",
  "description": "Make web pages interactive. Variables, functions, objects and the DOM — finishing with a small interactive project. Video lectures are hand-picked YouTube lessons from Programming with Mosh and Traversy Media.",
  "category": "Programming",
  "level": "Intermediate",
  "duration": "6 weeks",
  "fee": 1499,
  "capacity": 40,
  "location": "Online",
  "schedule": "Saturdays · 11:00 AM – 12:30 PM",
  "teaching_format": "Online",
  "certificate": true,
  "thumbnail": "https://i.ytimg.com/vi/W6NZfCO5SIk/hqdefault.jpg",
  "lessons": [
   {
    "title": "JavaScript in the browser",
    "description": "Run code in the console and in a page."
   },
   {
    "title": "Variables, functions and objects",
    "description": "The core building blocks."
   },
   {
    "title": "The DOM",
    "description": "Select elements and react to clicks."
   },
   {
    "title": "Project: interactive to-do list",
    "description": "Build it from scratch."
   }
  ],
  "lectures": [
   {
    "title": "JavaScript Course for Beginners – Your First Step to Web Development — Programming with Mosh",
    "youtube_url": "https://www.youtube.com/watch?v=W6NZfCO5SIk"
   },
   {
    "title": "JavaScript DOM Crash Course - Part 1 — Traversy Media",
    "youtube_url": "https://www.youtube.com/watch?v=0ik6X4DJKCc"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000006",
  "title": "Public Speaking & Storytelling",
  "description": "Speak up without freaking out. Manage nerves, use your voice well and tell a short story in front of a friendly group. Video lectures are hand-picked YouTube lessons from TEDx Talks and TED.",
  "category": "Community",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 499,
  "capacity": 25,
  "location": "Online + Bandra community hall, Mumbai",
  "schedule": "Tuesdays · 7:00 PM – 8:30 PM",
  "teaching_format": "Online + In-person",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/XIXvKKEQQJo/hqdefault.jpg",
  "lessons": [
   {
    "title": "Managing speaking anxiety",
    "description": "Simple techniques that calm nerves."
   },
   {
    "title": "Using your voice",
    "description": "Pace, volume, pitch and pauses."
   },
   {
    "title": "Structure a short story",
    "description": "Hook, journey and takeaway."
   },
   {
    "title": "Your 2-minute talk",
    "description": "Deliver a talk to the group and get feedback."
   }
  ],
  "lectures": [
   {
    "title": "Speaking Up Without Freaking Out | Matt Abrahams | TEDxPaloAlto — TEDx Talks",
    "youtube_url": "https://www.youtube.com/watch?v=XIXvKKEQQJo"
   },
   {
    "title": "How to Speak So That People Want to Listen | Julian Treasure | TED — TED",
    "youtube_url": "https://www.youtube.com/watch?v=eIho2S0ZahI"
   }
  ]
 },
 {
  "educator_id": "5eed0000-0000-4000-a000-000000000006",
  "title": "Indian Sign Language Basics",
  "description": "A free introduction to Indian Sign Language: the alphabet, greetings and everyday signs — a small step towards a more inclusive community. Video lectures are hand-picked YouTube lessons from Nagendra Nayak.",
  "category": "Community",
  "level": "Beginner",
  "duration": "4 weeks",
  "fee": 0,
  "capacity": 50,
  "location": "Online",
  "schedule": "Self-paced · practice circle Sundays 5:00 PM",
  "teaching_format": "Online",
  "certificate": false,
  "thumbnail": "https://i.ytimg.com/vi/tQQVHN-LZrs/hqdefault.jpg",
  "lessons": [
   {
    "title": "The ISL alphabet",
    "description": "Fingerspell your name."
   },
   {
    "title": "Greetings and introductions",
    "description": "Hello, thank you, how are you."
   },
   {
    "title": "Everyday signs",
    "description": "Family, food, places and time."
   },
   {
    "title": "Practice conversation",
    "description": "A short signed conversation with a partner."
   }
  ],
  "lectures": [
   {
    "title": "Learn Indian Sign Language - lesson 1 (Alphabets) — Nagendra Nayak",
    "youtube_url": "https://www.youtube.com/watch?v=tQQVHN-LZrs"
   },
   {
    "title": "Learn Indian Sign Language - lesson 5 (Greetings) — Nagendra Nayak",
    "youtube_url": "https://www.youtube.com/watch?v=sLqdPipf1UM"
   }
  ]
 }
]$seed$::jsonb)
    loop
        if exists (select 1 from public.courses
                   where educator_id = (c->>'educator_id')::uuid and title = c->>'title') then
            continue;
        end if;

        insert into public.courses (educator_id, title, description, category, level, duration, fee,
                                    capacity, location, schedule, teaching_format, certificate,
                                    thumbnail, published)
        values ((c->>'educator_id')::uuid, c->>'title', c->>'description', c->>'category',
                c->>'level', c->>'duration', (c->>'fee')::numeric, (c->>'capacity')::integer,
                c->>'location', c->>'schedule', c->>'teaching_format', (c->>'certificate')::boolean,
                c->>'thumbnail', true)
        returning id into new_id;

        n := 0;
        for item in select * from jsonb_array_elements(c->'lessons')
        loop
            n := n + 1;
            insert into public.lessons (course_id, title, description, lesson_order)
            values (new_id, item->>'title', item->>'description', n);
        end loop;

        n := 0;
        for item in select * from jsonb_array_elements(c->'lectures')
        loop
            n := n + 1;
            insert into public.course_lectures (course_id, title, youtube_url, lecture_order)
            values (new_id, item->>'title', item->>'youtube_url', n);
        end loop;
    end loop;
end;
$$;

-- 3. Upcoming meetups in Mumbai (dates are counted from today, India time).
do $$
declare
    m jsonb;
    starts timestamptz;
begin
    for m in select * from jsonb_array_elements($seed$[
 {
  "created_by": "5eed0000-0000-4000-a000-000000000001",
  "title": "Bollywood dance jam at Carter Road",
  "description": "An open, beginner-friendly dance jam. We'll learn one short routine together, then freestyle. Wear comfy shoes and bring water.",
  "category": "dance",
  "venue": "Carter Road Amphitheatre, Bandra West, Mumbai",
  "latitude": 19.0697,
  "longitude": 72.8221,
  "days": 3,
  "start": "18:00",
  "hours": 2,
  "capacity": 30
 },
 {
  "created_by": "5eed0000-0000-4000-a000-000000000003",
  "title": "Sketch walk at Kala Ghoda",
  "description": "Urban sketching around Kala Ghoda's heritage buildings. Bring a sketchbook and a pen — all levels welcome.",
  "category": "art",
  "venue": "Kala Ghoda, Fort, Mumbai",
  "latitude": 18.9285,
  "longitude": 72.8317,
  "days": 5,
  "start": "08:00",
  "hours": 2,
  "capacity": 15
 },
 {
  "created_by": "5eed0000-0000-4000-a000-000000000002",
  "title": "Acoustic jam by the sea",
  "description": "Bring a guitar, ukulele or just your voice. We'll share easy chord sheets so beginners can join in.",
  "category": "music",
  "venue": "Juhu Beach (near Juhu Chowpatty), Mumbai",
  "latitude": 19.0988,
  "longitude": 72.8264,
  "days": 6,
  "start": "17:30",
  "hours": 2,
  "capacity": 20
 },
 {
  "created_by": "5eed0000-0000-4000-a000-000000000006",
  "title": "Crochet & chai circle",
  "description": "Learn a basic stitch or bring your own project. Hooks and yarn available for first-timers.",
  "category": "community",
  "venue": "Bandra Fort (Castella de Aguada), Mumbai",
  "latitude": 19.0418,
  "longitude": 72.8186,
  "days": 8,
  "start": "16:00",
  "hours": 2,
  "capacity": 12
 },
 {
  "created_by": "5eed0000-0000-4000-a000-000000000004",
  "title": "Golden-hour photo walk at Marine Drive",
  "description": "Phone or camera — practise composition and shooting into the sunset. We'll review a few shots together at the end.",
  "category": "photography",
  "venue": "Marine Drive (near NCPA), Mumbai",
  "latitude": 18.9256,
  "longitude": 72.8211,
  "days": 10,
  "start": "17:30",
  "hours": 2,
  "capacity": 20
 }
]$seed$::jsonb)
    loop
        -- Replace a demo meetup that has already happened with a fresh date.
        delete from public.meetups
        where created_by = (m->>'created_by')::uuid and title = m->>'title' and starts_at < now();

        if exists (select 1 from public.meetups
                   where created_by = (m->>'created_by')::uuid and title = m->>'title') then
            continue;
        end if;

        starts := ((current_date + (m->>'days')::integer)::timestamp + (m->>'start')::time)
                  at time zone 'Asia/Kolkata';
        insert into public.meetups (created_by, title, description, category, venue, latitude, longitude,
                                    starts_at, ends_at, capacity)
        values ((m->>'created_by')::uuid, m->>'title', m->>'description', m->>'category', m->>'venue',
                (m->>'latitude')::double precision, (m->>'longitude')::double precision,
                starts, starts + make_interval(hours => (m->>'hours')::integer), (m->>'capacity')::integer);
    end loop;
end;
$$;

-- Done — shows what's there now.
select 'Demo educators' as item, count(*)::text as result from public.profiles where id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006')
union all
select 'Demo classes', count(*)::text from public.courses where educator_id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006')
union all
select 'Demo lectures (YouTube)', count(*)::text from public.course_lectures l join public.courses c on c.id = l.course_id where c.educator_id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006')
union all
select 'Upcoming demo meetups', count(*)::text from public.meetups where created_by in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006') and starts_at > now();
