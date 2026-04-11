const axios   = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';
const BASE_URL      = 'https://portal.dkut.ac.ke';
const SESSION_TTL   = 25 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 OPR/129.0.0.0';

let sessionCookies   = null;
let sessionTimestamp = 0;

// ── All 105 fee structure links extracted from portal ─────────────────────────
const ALL_FEES = [
  // Certificates
  { category: 'CERTIFICATES', label: 'CERTIFICATE FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=CERTIFICATE+FEES+STRUCTURES&type=CERTIFICATES' },
  // Diplomas
  { category: 'DIPLOMAS', label: 'DIPLOMA FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=DIPLOMA+FEES+STRUCTURES&type=DIPLOMAS' },
  // Year 1 GOK
  { category: 'YEAR 1 GOK', label: 'GOVERNMENT SPONSORED STUDENTS FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=GOVERNMENT+SPONSORED+STUDENTS+FEES+STRUCTURES&type=YEAR+1+GOK' },
  // Year 1 SSP
  { category: 'YEAR 1 SSP', label: 'SELF SPONSORED FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=SELF+SPONSORED+FEES+STRUCTURES&type=YEAR+1+SSP' },
  // Second Year GOK
  { category: 'SECOND YEAR GOK', label: 'BACHELOR OF EDUCATION IN TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+EDUCATION+IN+TECHNOLOGY&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BACHELOR OF TOURISM & HOSPITALITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+TOURISM+%26+HOSPITALITY+MANAGEMENT&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BBA', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBA&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BBIT FEE STRUCTURE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBIT+FEE+STRUCTURE&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BCOM & BPSM FEES STRUCTURE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM+%26+BPSM+FEES+STRUCTURE&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC IN GEOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+IN+GEOLOGY&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC MATHEMATICS & MODELLING PROCESSES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+MATHEMATICS+%26+MODELLING+PROCESSES&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. ENGINEERING & IGGRESS PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+ENGINEERING+%26+IGGRESS+PROG.&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. FOOD SCIENCE & BSC. NUTRITION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+FOOD+SCIENCE+%26+BSC.+NUTRITION&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. IN COMPUTER SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+COMPUTER+SCIENCE&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. IN NURSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+NURSING&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. IT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IT&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BSC. LEATHER, INDUSTRIAL, ACTURIAL & POLYMER', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+LEATHER%2C+INDUSTRIAL%2C+ACTURIAL+%26+POLYMER&type=SECOND+YEAR+GOK' },
  { category: 'SECOND YEAR GOK', label: 'BUILDING AND CONSTRUCTION FEES STRUCTURE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BUILDING+AND+CONSTRUCTION+FEES+STRUCTURE&type=SECOND+YEAR+GOK' },
  // Year 2 SSP
  { category: 'YEAR 2 SSP', label: '2ND YR BSC. CRIMINOLOGY & SECURITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=2ND+YR+BSC.+CRIMINOLOGY+%26+SECURITY+MANAGEMENT&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BACHELOR OF EDUCATION IN TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+EDUCATION+IN+TECHNOLOGY&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BACHELOR OF SUSTAINABLE TOURISM & HOSPITALITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+SUTAINABLE+TOURISM+%26+HOSPITALITY+MANAGEMENT&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BACHELOR OF TECHNOLOGY IN BUILDING CONSTRUCTION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+TECHNOLOGY+IN+BUILDING+CONSTRUCTION&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BBA', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBA&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BBIT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBIT&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BCOM, BPSM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM%2C+BPSM&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. ENGINEERING & IGGRESS PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+ENGINEERING+%26+IGGRESS+PROG.&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. FOOD SCI & BSC. NUTRITION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+FOOD+SCI+%26+BSC.+NUTRITION&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN COMPUTER SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+COMPUTER+SCIENCE&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN GEOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+GEOLOGY&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN IT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+IT&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN LEATHER, ACTURIAL, POLYMER & INDUSTRIAL CHEMISTRY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+LEATHER%2C+ACTURIAL%2C+POLYMER+%26+INDUSTRIAL+CHEMISTRY&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN MATHEMATICS & MODELLING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+MATHEMATICS+%26+MODELLING&type=YEAR+2++SSP' },
  { category: 'YEAR 2 SSP', label: 'BSC. IN NURSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+NURSING&type=YEAR+2++SSP' },
  // Third Year GOK
  { category: 'THIRD YEAR GOK', label: 'BACHELOR OF EDUCATION IN TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+EDUCATION+IN+TECHNOLOGY&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BACHELOR OF SUSTAINABLE TOURISM & HOSPITALITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+SUSTAINABLE+TOURISM+%26+HOSPITALITY+MANAGEMENT&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BACHELOR OF TECHNOLOGY IN BUILDING CONSTRUCTION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+TECHNOLOGY+IN+BUILDING+CONSTRUCTION&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BBA', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBA&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BBIT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBIT&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BCOM & BPSM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM+%26+BPSM&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. ENGINEERING & GEGIS PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+ENGINEERING+%26+GEGIS+PROG.&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN ACTURIAL & BSC INDUSTRIAL CHEM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+ACTURIAL+%26+BSC+INDUSTRIAL+CHEM&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN COMPUTER SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+COMPUTER+SCIENCE&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN FOOD SCI & BSC IN NUTRITION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+FOOD+SCI+%26+BSC+IN+NUTRITION&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN GEOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+GEOLOGY&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN GEOSPATIAL INFORMATION AND REMOTE SENSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+GEOSPATIAL+INFORMATION+AND+REMOTE+SENSING&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN IT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+IT&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN LEATHER & POLYMER', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+LEATHER+%26+POLYMER&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN MATHEMATICS & MODELLING PROCESSES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+MATHEMATICS+%26+MODELLING+PROCESSES&type=THIRD+YEAR+GOK' },
  { category: 'THIRD YEAR GOK', label: 'BSC. IN NURSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+NURSING&type=THIRD+YEAR+GOK' },
  // Third Year SSP
  { category: 'THIRD YEAR SSP', label: '3RD YR BSC CRIMINOLOGY & SECURITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=3RD+YR+BSC+CRIMINOLOGY+%26+SECURITY+MANAGEMENT&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BACHELOR OF EDUCATION IN TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+EDUCATION+IN+TECHNOLOGY&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BACHELOR OF TECHNOLOGY IN BUILDING CONSTRUCTION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+TECHNOLOGY+IN+BUILDING+CONSTRUCTION&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BACHELOR OF TOURISM & HOSPITALITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BACHELOR+OF+TOURISM+%26+HOSPITALITY+MANAGEMENT&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BBA', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBA&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BBIT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BBIT&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BCOM, BPSM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM%2C+BPSM&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN ACTURIAL SCI & BSC. IN INDUSTRIAL CHEM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+ACTURAIL+SCI+%26+BSC.+IN+INDUSTRIAL+CHEM&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN COMPUTER SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+COMPUTER+SCIENCE&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN ENGINEERING & GEGIS PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+ENGINEERING+%26+GEGIS+PROG.&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN FOOD SCIENCE & BSC. IN NUTRITION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+FOOD+SCIENCE+%26+BSC.+IN+NUTRITION&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN GEOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+GEOLOGY&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN GEOSPATIAL INFORMATION AND REMOTE SENSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+GEOSPATIAL+INFORMATION+AND+REMOTE+SENSING&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN IT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+IT&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN LEATHER & POLYMER CHEM', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+LEATHER+%26+POLYMER+CHEM&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN MATHEMATICS & MODELLING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+MATHEAMTICS+%26+MODELLING&type=THIRD+YEAR+SSP' },
  { category: 'THIRD YEAR SSP', label: 'BSC. IN NURSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+IN+NURSING&type=THIRD+YEAR+SSP' },
  // Fourth Year GOK
  { category: 'FOURTH YEAR GOK', label: '4TH YR GOK FEES 1', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=4TH+YR+GOK+FEES+1&type=FOURTH+YEAR+GOK' },
  { category: 'FOURTH YEAR GOK', label: 'BCOM, BBA, BPSM, ACTURIAL SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM%2C+BBA%2C+BPSM%2C+ACTURIAL+SCIENCE&type=FOURTH+YEAR+GOK' },
  { category: 'FOURTH YEAR GOK', label: 'BED TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BED+TECHNOLOGY&type=FOURTH+YEAR+GOK' },
  { category: 'FOURTH YEAR GOK', label: 'BSC NURSING', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+NURSING&type=FOURTH+YEAR+GOK' },
  { category: 'FOURTH YEAR GOK', label: 'BSC. ENGINEERING PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+ENGINEERING+PROG.&type=FOURTH+YEAR+GOK' },
  { category: 'FOURTH YEAR GOK', label: 'LISTED PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=LISTED+PROG.&type=FOURTH+YEAR+GOK' },
  // Fourth Year SSP
  { category: 'FOURTH YEAR SSP', label: '4TH YR SSP FEES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=4TH+YR+SSP+FEES&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'ACTURIAL SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=ACTURIAL+SCIENCE&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BCOM, BPSM, BBA', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BCOM%2C+BPSM%2C+BBA&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BED TECHNOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BED+TECHNOLOGY&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BSC COMPUTER SCIENCE', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+COMPUTER+SCIENCE&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BSC ENGINEERING PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+ENGINEERING+PROG.&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BSC GEOLOGY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+GEOLOGY&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BSC NURSING DIRECT ENTRY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC+NURSING+DIRECT+ENTRY&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BSC. CRIMINOLOGY AND SECURITY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+CRIMINOLOGY+AND+SECURITY&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'BUILDING CONSTRUCTION', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BUILDING+CONSTRUCTION&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'GEOSPATIAL AND INFO.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=GEOSPATIAL+AND+INFO.&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'IT & BBIT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=IT+%26+BBIT&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'LEATHER TECH. & INDUSTRIAL CHEMISTRY', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=LEATHER+TECH.+%26+INDUSTRIAL+CHEMISTRY&type=FOURTH+YEAR+SSP' },
  { category: 'FOURTH YEAR SSP', label: 'SUSTAINABLE TOURISM & HOSPITALITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=SUSTAINABLE+TOURISM+%26+HOSPITALITY+MANAGEMENT&type=FOURTH+YEAR+SSP' },
  // Fifth Year
  { category: 'FIFTH YEAR GOK', label: 'BSC. ENGINEERING PROG.', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=BSC.+ENGINEERING+PROG.&type=FIFTH+YEAR+GOK' },
  { category: 'FIFTH YEAR SSP', label: '5TH YR SSP FEES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=5TH+YR+SSP+FEES&type=FIFTH+YEAR+SSP' },
  // Double Degree
  { category: 'DOUBLE DEGREE', label: 'DOUBLE DEGREE FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=DOUBLE+DEGREE+FEES+STRUCTURES&type=DOUBLE+DEGREE' },
  // Masters & PhD
  { category: 'MASTERS', label: 'MASTERS PROGRAMMES FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=MASTERS+PROGRAMMES+FEES+STRUCTURES&type=MASTERS+PROGRAMMES+FEES+STRUCTURES+2026' },
  { category: 'PHD', label: 'PHD PROGRAMMES FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=PHD+PROGRAMMES+FEES+STRUCTURES&type=PHD' },
  // Post Graduate Diploma
  { category: 'PGDS', label: 'POST GRADUATE DIPLOMA FEES STRUCTURES', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=POST+GRADUATE+DIPLOMA+FEES+STRUCTURES&type=PGDS' },
  // Module III
  { category: 'MODULE III MECHANICAL', label: '1ST YEAR - BSC MECHANICAL SSP', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=1ST+YEAR-+MODULE+III+BSC+MECHANICAL-+SSP&type=MODULE+III+BSC.+IN+MECHANICAL+ENGINEERING+YEAR+1-5' },
  { category: 'MODULE III MECHANICAL', label: '2ND YEAR - BSC MECHANICAL SSP', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=2ND+YEAR-+MODULE+III+BSC+MECHANICAL-+SSP&type=MODULE+III+BSC.+IN+MECHANICAL+ENGINEERING+YEAR+1-5' },
  { category: 'MODULE III MECHANICAL', label: '3RD YEAR - BSC MECHANICAL SSP', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=3RD+YEAR-+MODULE+III+BSC+MECHANICAL-+SSP&type=MODULE+III+BSC.+IN+MECHANICAL+ENGINEERING+YEAR+1-5' },
  { category: 'MODULE III MECHANICAL', label: '4TH YEAR - BSC MECHANICAL SSP', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=4TH+YEAR-+MODULE+III+BSC+MECHANICAL-+SSP&type=MODULE+III+BSC.+IN+MECHANICAL+ENGINEERING+YEAR+1-5' },
  { category: 'MODULE III MECHANICAL', label: '5TH YEAR - BSC MECHANICAL SSP', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=5TH+YEAR-+MODULE+III+BSC+MECHANICAL-+SSP&type=MODULE+III+BSC.+IN+MECHANICAL+ENGINEERING+YEAR+1-5' },
  // Misc / feeStructUpload
  { category: 'OTHER', label: '1ST YR BSC. CRIMINOLOGY & SECURITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=1ST+YR+BSC.+CRIMINOLOGY+%26+SECURITY+MANAGEMENT&type=feeStructUpload' },
  { category: 'OTHER', label: '2ND YR BSC. CRIMINOLOGY & SECURITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=2ND+YR+BSC.+CRIMINOLOGY+%26+SECURITY+MANAGEMENT&type=feeStructUpload' },
  { category: 'OTHER', label: '3RD YR BSC CRIMINOLOGY & SECURITY MANAGEMENT', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=3RD+YR+BSC+CRIMINOLOGY+%26+SECURITY+MANAGEMENT&type=feeStructUpload' },
  { category: 'OTHER', label: 'Certificate in Information Technology', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=Certificate+in+Information+Technology&type=feeStructUpload' },
  { category: 'OTHER', label: 'Diploma in Information Technology Fee', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=Diploma+in+Information+Technology+Fee&type=feeStructUpload' },
  { category: 'OTHER', label: 'Listed SoS Prog. & MSc. Food Sci. - Institutionalized', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=Listed+SoS+Prog.+%26+MSc.+Food+Sci.-+Institutionalized&type=feeStructUpload' },
  { category: 'OTHER', label: 'Listed SoS Prog. & MSc. Food Sci. - Partial Scholarship', url: 'https://portal.dkut.ac.ke/student/downloadfeestructure?filename=Listed+SoS+Prog.+%26+MSc.+Food+Sci.-+Partial+Scholarship&type=feeStructUpload' },
];

// ── Cookie helpers ────────────────────────────────────────────────────────────
function parseCookies(headers) {
    const map = {};
    (headers['set-cookie'] || []).forEach(line => {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    });
    return map;
}
function merge(a, b) { return { ...a, ...b }; }
function serialize(map) { return Object.entries(map).map(([k,v])=>`${k}=${v}`).join('; '); }

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(email, password) {
    let cookies = {};
    const lp = await axios.get(`${BASE_URL}/site/login`, { headers:{'User-Agent':UA}, maxRedirects:5, validateStatus:()=>true });
    cookies = merge(cookies, parseCookies(lp.headers));
    const $ = cheerio.load(lp.data);
    const csrf = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val() || '';
    if (!csrf) return { success:false, error:'No CSRF on login page' };

    const post = await axios.post(`${BASE_URL}/site/login`,
        new URLSearchParams({ '_csrf':csrf, 'LoginForm[username]':email, 'LoginForm[password]':password, 'LoginForm[rememberMe]':'0' }).toString(),
        { headers:{ 'Content-Type':'application/x-www-form-urlencoded', Cookie:serialize(cookies), Referer:`${BASE_URL}/site/login`, Origin:BASE_URL, 'User-Agent':UA }, maxRedirects:0, validateStatus:()=>true }
    );
    cookies = merge(cookies, parseCookies(post.headers));
    const loc = post.headers['location'] || '';
    if (post.status !== 302)   return { success:false, error:`Login returned ${post.status}` };
    if (loc.includes('login')) return { success:false, error:'Wrong credentials' };

    // Follow redirect to establish session
    const dashUrl = loc.startsWith('http') ? loc : `${BASE_URL}${loc}`;
    const dash = await axios.get(dashUrl, { headers:{ 'User-Agent':UA, Cookie:serialize(cookies), Referer:`${BASE_URL}/site/login` }, maxRedirects:5, validateStatus:()=>true });
    cookies = merge(cookies, parseCookies(dash.headers));

    // Warm up: visit allfeestructure (as browser does)
    await axios.get(`${BASE_URL}/student/allfeestructure`, { headers:{ 'User-Agent':UA, Cookie:serialize(cookies), Referer:dashUrl }, maxRedirects:5, validateStatus:()=>true });

    return { success:true, cookies };
}

// ── Download proxy ────────────────────────────────────────────────────────────
async function proxyDownload(cookies, targetUrl) {
    const res = await axios.get(targetUrl, {
        headers: {
            'User-Agent'                : UA,
            'Accept'                    : 'application/pdf,application/octet-stream,*/*',
            'Accept-Language'           : 'en-GB,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding'           : 'gzip, deflate, br',
            'Cookie'                    : serialize(cookies),
            'Referer'                   : `${BASE_URL}/student/allfeestructure`,
            'Sec-Fetch-Dest'            : 'document',
            'Sec-Fetch-Mode'            : 'navigate',
            'Sec-Fetch-Site'            : 'same-origin',
            'Upgrade-Insecure-Requests' : '1',
        },
        responseType  : 'arraybuffer',
        maxRedirects  : 5,
        validateStatus: ()=>true,
    });
    return { status:res.status, buffer:res.data, contentType:res.headers['content-type']||'', disposition:res.headers['content-disposition']||'' };
}

// ── Vercel handler ────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // GET /api/fees → return full index of all fee files
    if (!req.query || !req.query.url) {
        const categories = {};
        ALL_FEES.forEach(f => {
            if (!categories[f.category]) categories[f.category] = [];
            categories[f.category].push({ label:f.label, downloadPath:`/api/fees?url=${encodeURIComponent(f.url)}` });
        });
        return res.status(200).json({ total: ALL_FEES.length, categories });
    }

    // GET /api/fees?url=... → login + proxy download
    const targetUrl = req.query.url;
    const isKnown   = ALL_FEES.some(f => f.url === targetUrl);
    if (!isKnown || !targetUrl.startsWith(BASE_URL)) {
        return res.status(400).json({ error: 'Unknown or disallowed download URL' });
    }

    try {
        const now = Date.now();
        if (!sessionCookies || now - sessionTimestamp > SESSION_TTL) {
            const r = await login(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: r.error });
            sessionCookies   = r.cookies;
            sessionTimestamp = now;
        }

        const file = await proxyDownload(sessionCookies, targetUrl);

        if (file.status !== 200 || file.contentType.includes('text/html')) {
            // Session may have died — clear and tell client to retry
            sessionCookies = null;
            const bodyText = Buffer.from(file.buffer).toString('utf8');
            const $e = cheerio.load(bodyText);
            return res.status(502).json({
                error      : $e('.alert-danger,.site-error').text().trim() || `Portal returned HTTP ${file.status}`,
                retry      : true,
            });
        }

        const label = ALL_FEES.find(f => f.url === targetUrl)?.label || 'fee-structure';
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', file.disposition || `attachment; filename="${label}.pdf"`);
        if (file.buffer.byteLength) res.setHeader('Content-Length', file.buffer.byteLength);
        return res.status(200).send(Buffer.from(file.buffer));

    } catch(err) {
        return res.status(500).json({ error: err.message });
    }
};
