// Other Local Services, the most booked in depth: more jobs on tutors, music, dance, fitness, photography, computers and interiors, and eight new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const cls = (a, b, c, d) => ({ primary: a, middle: b, high: c, senior: d });
const music = (g, k, v, o) => ({ guitar: g, keyboard: k, vocal: v, other: o });
const fit = (p, y) => ({ personal: p, yoga: y });
const shoot = (e, p, pr) => ({ event: e, portrait: p, product: pr });

const extend = {
  home_tutor: [
    job('month_3', 'Monthly tuition, 3 days a week', 60, cls(2499, 2999, 3999, 4999), '12 classes a month|All subjects or one|Progress note each month'),
    job('month_5', 'Monthly tuition, 5 days a week', 60, cls(3999, 4999, 5999, 7499), '20 classes a month|Homework help|Progress note each month'),
    job('exam_prep', 'Exam preparation, 10 classes', 90, cls(2999, 3499, 4999, 5999), 'Past papers|Weak topics first|Mock test'),
    job('homework', 'Homework help, 1 hour', 60, cls(299, 349, 449, 549), 'Today\'s homework done together|Concepts explained|Doubts cleared'),
    job('single_subject', 'One subject, 8 classes (maths, science, English)', 60, cls(1999, 2499, 3499, 4499), 'One subject of your choice|Board syllabus|Worksheets'),
  ],
  music_teacher: [
    job('month_8', 'Monthly lessons, 8 classes', 60, music(2499, 2499, 2499, 2999), 'Two classes a week|Practice plan|Songs of your choice'),
    job('exam', 'Trinity or graded exam preparation, 8 classes', 60, music(3499, 3499, 3499, 3999), 'Syllabus pieces|Theory|Mock exam'),
    job('kids_batch', 'Kids group class at home, per child, monthly', 60, music(1499, 1499, 1499, 1799), 'Up to 4 children|Fun songs|Recital at month end'),
    job('tuning', 'Instrument tuning and setup', 45, music(399, 499, 399, 499), 'Tuned by ear and tuner|Strings or keys checked|Care tips'),
  ],
  dance_teacher: [
    job('month_8', 'Monthly dance classes, 8 classes', 60, 2999, 'Two classes a week|Style of your choice|Routine by month end'),
    job('wedding', 'Wedding or sangeet choreography, per song', 240, 4999, 'Song cut planned|Steps for the group|Up to 4 rehearsals'),
    job('zumba', 'Zumba or dance fitness, monthly 12 classes', 60, 2499, 'High-energy workout|Beginner friendly|Music brought'),
    job('kids_dance', 'Kids dance class, monthly 8 classes', 60, 1999, 'Bollywood or western|Fun and fitness|Performance at month end'),
  ],
  fitness_trainer: [
    job('month_12', 'Monthly training, 12 sessions', 60, fit(5999, 3999), 'Three sessions a week|Plan for your goal|Progress tracking'),
    job('prenatal', 'Prenatal yoga, 8 sessions', 60, fit(4999, 3999), 'Safe for pregnancy|Breathing and stretches|Doctor approval asked'),
    job('senior', 'Seniors fitness and yoga, 8 sessions', 45, fit(3999, 2999), 'Gentle mobility|Balance and strength|Chair options'),
    job('weight_loss', 'Weight loss plan with diet chart, monthly', 60, fit(6999, 4999), '12 sessions|Diet chart|Weekly check-in'),
  ],
  photography: [
    job('full_day', 'Full day shoot (8 hours)', 480, shoot(12999, 9999, 11999), 'Edited photos delivered|Online gallery|Raw files on request'),
    job('reels', 'Reels and short video, 2 hours', 120, shoot(4999, 3999, 4999), 'Vertical video|Two edited reels|Music added'),
    job('album', 'Printed photo album, 30 pages', 60, shoot(5999, 4999, 5999), 'Design by us|Premium print|Delivered home'),
    job('drone', 'Drone photos and video add-on, 2 hours', 120, shoot(5999, 5999, 5999), 'Licensed drone pilot|Aerial photos and clip|Weather allowing'),
  ],
  computer_classes: [
    job('office', 'MS Office course, 10 classes', 60, 2999, 'Word, Excel, PowerPoint|Practice files|Certificate of completion'),
    job('tally', 'Tally and GST basics, 12 classes', 60, 3999, 'Accounts entries|GST invoices|Practice company'),
    job('seniors', 'Phone and computer help for seniors, 5 classes', 60, 1499, 'WhatsApp, UPI and video calls|Safety from scams|Written notes'),
    job('excel_advanced', 'Advanced Excel, 8 classes', 60, 3499, 'Formulas and pivots|Dashboards|Real work files'),
  ],
  interior_design: [
    job('plan_2d', '2D furniture layout plan, per room', 120, 1999, 'Measurements|Layout options|Drawing shared'),
    job('design_3d', '3D design, per room', 240, 4999, 'Look of your choice|3D views|Two rounds of changes'),
    job('kitchen', 'Modular kitchen design', 240, 5999, 'Layout and materials|3D view|Budget estimate'),
    job('supervise', 'Site supervision visit', 120, 1499, 'Work checked against design|Issues listed|Next steps'),
  ],
};

const lines = [
  { code: 'spoken_english', prefix: 'spkeng', name: 'Spoken English & communication', domainCode: 'local_pros', icon: 'GraduationCap', thing: 'class', types: ONE, inHome: true, isPopular: true,
    packages: [
      job('trial', 'Trial class', 45, 99, 'Level check|Plan for you|No commitment'),
      job('month_12', 'Spoken English, 12 classes', 60, 2999, 'Daily conversation|Pronunciation|Speaking practice'),
      job('interview', 'Interview preparation, 6 classes', 60, 2499, 'Common questions|Mock interviews|Body language'),
      job('kids', 'Spoken English for kids, 12 classes', 45, 2499, 'Games and stories|Confidence|Phonics'),
      job('ielts', 'IELTS speaking and writing, 10 classes', 60, 4999, 'Band strategies|Mock tests|Feedback'),
      job('business', 'Business English and emails, 8 classes', 60, 3499, 'Emails and calls|Presentations|Meeting language'),
    ] },
  { code: 'language_classes', prefix: 'langcls', name: 'Hindi, Telugu & foreign language classes', domainCode: 'local_pros', icon: 'GraduationCap', thing: 'class', types: ONE, inHome: true,
    packages: [
      job('trial', 'Trial class', 45, 99, 'Level check|Plan for you|No commitment'),
      job('hindi', 'Hindi, 12 classes', 60, 2499, 'Reading and writing|Speaking|School syllabus help'),
      job('telugu', 'Telugu, 12 classes', 60, 2499, 'Reading and writing|Speaking|School syllabus help'),
      job('french_german', 'French or German, 12 classes', 60, 3999, 'Beginner level A1|Speaking and grammar|Workbook'),
      job('sanskrit', 'Sanskrit, 12 classes', 60, 2499, 'Shlokas and grammar|School syllabus|Pronunciation'),
      job('arabic_urdu', 'Arabic or Urdu, 12 classes', 60, 2499, 'Reading and writing|Speaking|Pronunciation'),
    ] },
  { code: 'art_craft', prefix: 'artcraft', name: 'Art, drawing & craft classes', domainCode: 'local_pros', icon: 'Palette', thing: 'class', types: ONE, inHome: true,
    packages: [
      job('trial', 'Trial class', 45, 99, 'Level check|Plan for you|No commitment'),
      job('drawing_kids', 'Drawing and painting for kids, 8 classes', 60, 1999, 'Sketching and colours|Fun themes|Art kit list shared'),
      job('adults', 'Painting for adults, 8 classes', 90, 2999, 'Acrylic or watercolour|Techniques|One finished piece'),
      job('craft', 'Craft and clay, 8 classes', 60, 2499, 'Clay, paper and DIY|Take-home creations|Materials list shared'),
      job('calligraphy', 'Calligraphy and handwriting, 8 classes', 60, 2499, 'Pens and strokes|Better handwriting|Practice sheets'),
      job('mandala', 'Mandala and doodle art, 6 classes', 60, 1799, 'Patterns and shading|Relaxing|Pens list shared'),
    ] },
  { code: 'kids_coding', prefix: 'kidcode', name: 'Coding, robotics & chess for kids', domainCode: 'local_pros', icon: 'Laptop', thing: 'class', types: ONE, inHome: true,
    packages: [
      job('trial', 'Trial class', 45, 99, 'Level check|Plan for you|No commitment'),
      job('scratch', 'Scratch coding, 8 classes (age 6 to 10)', 60, 2999, 'Games and animations|Logic building|Project at the end'),
      job('python', 'Python for kids, 10 classes (age 10+)', 60, 3999, 'Basics to small apps|Problem solving|Project at the end'),
      job('robotics', 'Robotics basics, 8 classes', 60, 4499, 'Kit-based learning|Sensors and motors|Build a robot'),
      job('chess', 'Chess coaching, 8 classes', 60, 2499, 'Openings and tactics|Practice games|Tournament tips'),
      job('abacus', 'Abacus and mental maths, 8 classes', 60, 1999, 'Speed maths|Concentration|Level test'),
    ] },
  { code: 'tax_filing', prefix: 'taxfile', name: 'Income tax, GST & accounts help', domainCode: 'local_pros', icon: 'FileText', thing: 'service', types: ONE,
    packages: [
      job('itr_salary', 'Income tax return, salaried', 60, 799, 'Form 16 based|Deductions checked|Filed and acknowledgement shared'),
      job('itr_business', 'Income tax return, business or freelance', 120, 2499, 'Books reviewed|Tax worked out|Filed and acknowledgement shared'),
      job('gst_register', 'GST registration', 60, 1499, 'Documents checked|Application filed|GSTIN shared'),
      job('gst_monthly', 'GST returns, monthly', 60, 999, 'GSTR-1 and 3B|Reconciliation|Due-date reminders'),
      job('bookkeeping', 'Bookkeeping, monthly (small business)', 120, 2999, 'Entries in Tally or Excel|Bank reconciliation|Monthly summary'),
      job('tax_notice', 'Tax notice help', 60, 1999, 'Notice read and explained|Reply drafted|Filed online'),
    ] },
  { code: 'legal_docs', prefix: 'legaldoc', name: 'Rental agreement, notary & legal documents', domainCode: 'local_pros', icon: 'FileText', thing: 'document', types: ONE,
    packages: [
      job('rental', 'Rental agreement with stamp paper, delivered', 60, 999, 'Drafted to your terms|Stamp paper|Delivered for signing'),
      job('notary', 'Notary attestation, per document', 30, 299, 'Notary visit or pickup|Stamp and sign|Returned to you'),
      job('affidavit', 'Affidavit drafting and notary', 45, 499, 'Drafted for your purpose|Stamp paper|Notarised'),
      job('will_draft', 'Will drafting with a lawyer', 120, 4999, 'Lawyer consultation|Will drafted|Witness guidance'),
      job('legal_consult', 'Lawyer consultation, 30 minutes', 30, 999, 'Property, family or consumer|Advice by phone or visit|Next steps'),
      job('police_verify', 'Tenant police verification help', 45, 499, 'Form filled|Documents checked|Submission guided'),
    ] },
  { code: 'tailoring_alterations', prefix: 'tailor', name: 'Tailoring & alterations', domainCode: 'local_pros', icon: 'Shirt', thing: 'garment', types: ONE,
    packages: [
      job('alteration', 'Simple alteration (length, fit), per piece', 30, 149, 'Pickup and drop or at home|Measured on you|Ready in 2 days'),
      job('blouse', 'Blouse stitching', 60, 799, 'Measurement at home|Design of your choice|Lining included'),
      job('kurta', 'Kurti or kurta stitching', 60, 699, 'Measurement at home|Design of your choice|Ready in 5 days'),
      job('saree_fall', 'Saree fall and pico', 30, 199, 'Fall stitched|Pico edging|Pressed'),
      job('suit', 'Salwar suit stitching', 90, 999, 'Top, bottom and dupatta finish|Measurement at home|Ready in 7 days'),
      job('mens_pant', 'Men\'s trouser or shirt stitching', 60, 699, 'Measurement at home|Fit of your choice|Ready in 5 days'),
    ] },
  { code: 'pandit_puja', prefix: 'pandit', name: 'Pandit & puja services', domainCode: 'local_pros', icon: 'Flower2', thing: 'puja', types: ONE, inHome: true, isPopular: true,
    packages: [
      job('griha_pravesh', 'Griha pravesh puja', 180, 5100, 'Experienced pandit|Puja items list shared|Muhurat guidance'),
      job('satyanarayan', 'Satyanarayan puja', 120, 3100, 'Pandit and katha|Puja items list shared|Prasad guidance'),
      job('ganesh', 'Ganesh puja', 90, 2100, 'Pandit|Puja items list shared|Aarti'),
      job('lakshmi', 'Lakshmi puja (Diwali)', 90, 2500, 'Pandit|Puja items list shared|Muhurat guidance'),
      job('naming', 'Naamkaran (naming ceremony)', 90, 2500, 'Pandit|Name letters by birth details|Puja items list shared'),
      job('vastu', 'Vastu shanti puja', 180, 5100, 'Pandit|Havan|Puja items list shared'),
      job('puja_kit', 'Puja with all items brought', 120, 4999, 'Pandit and every item|Flowers and fruits|Set-up and clean-up'),
    ] },
];

module.exports = { extend, lines };
