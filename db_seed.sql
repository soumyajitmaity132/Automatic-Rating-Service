--
-- PostgreSQL database dump
--

\restrict utfbvmDuAF1Bd8ZPLhidTWDA7AkPYOJ2rPaxi1b6w9lI9ikUHMp5lRRJ75jb2ka

-- Dumped from database version 15.16 (Debian 15.16-0+deb12u1)
-- Dumped by pg_dump version 15.16 (Debian 15.16-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: emp_user
--

INSERT INTO public.teams VALUES (5, 'SCIM Team A', 'c92af833-fe08-435a-9694-f7c4f3b75a1a', NULL);
INSERT INTO public.teams VALUES (6, 'SCIM Team B', 'c92af833-fe08-435a-9694-f7c4f3b75a1a', NULL);
INSERT INTO public.teams VALUES (7, 'SCIM Team C', 'c92af833-fe08-435a-9694-f7c4f3b75a1a', NULL);
INSERT INTO public.teams VALUES (8, 'SCIM Team D', 'c92af833-fe08-435a-9694-f7c4f3b75a1a', NULL);


--
-- Data for Name: items_to_rate; Type: TABLE DATA; Schema: public; Owner: emp_user
--

INSERT INTO public.items_to_rate VALUES (62, 'Leave Management', NULL, 8, 0.05, 'Leave Management', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (63, 'Leave Management', NULL, 8, 0.05, 'Leave Management', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (64, 'Leave Management', NULL, 8, 0.05, 'Leave Management', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (67, 'Core Contributions', 'SCIM Project Delivery [55%]
Individual should proactively complete and contribute or drive at least 2 full SCIM projects simultaneously with ownership and minimum supervision .', 7, 0.55, 'Core Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (80, 'SUBJECTIVE FEEDBACK', 'Accountability / Responsibility
Availability
Appreciation Received (with evidence)', 7, 0.1, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (81, 'SUBJECTIVE FEEDBACK', 'Accountability / Responsibility
Availability
Appreciation Received (with evidence)', 7, 0.1, 'Core Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (82, 'SUBJECTIVE FEEDBACK', 'Accountability / Responsibility
Availability
Appreciation Received (with evidence)', 7, 0.1, 'Core Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (65, 'Core Contributions', 'SCIM Project Delivery [55%]
Individual should proactively complete and contribute or drive at least 2 full SCIM projects simultaneously with ownership and minimum supervision .', 7, 0.55, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (66, 'Core Contributions', 'SCIM Project Delivery [55%]
Individual should proactively complete and contribute or drive at least 2 full SCIM projects simultaneously with ownership and minimum supervision .', 7, 0.55, 'Core Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (38, 'SCIM Project Delivery', NULL, 5, 0.55, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (39, 'Org Contributions', NULL, 5, 0.1, 'Org Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (40, 'Value Addition', NULL, 5, 0.1, 'Value Addition', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (41, 'Leave Management', NULL, 5, 0.05, 'Leave Management', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (42, 'Subjective Feedback', NULL, 5, 0.1, 'Subjective Feedback', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (43, 'SELF LEARNING & DEVELOPMENT', NULL, 5, 0.1, 'Self Learning & Development', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (68, 'Org Contributions', 'Individual should proactively own at least 1-2 SCIM projects simultaneously with ownership and minimum supervision within defined timeline.', 7, 0.1, 'Org Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (69, 'Org Contributions', 'Individual should proactively own at least 1-2 SCIM projects simultaneously with ownership and minimum supervision within defined timeline.', 7, 0.1, 'Org Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (70, 'Org Contributions', 'Individual should proactively own at least 1-2 SCIM projects simultaneously with ownership and minimum supervision within defined timeline.', 7, 0.1, 'Org Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (47, 'SCIM Project Delivery', NULL, 8, 0.55, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (48, 'SCIM Project Delivery', NULL, 8, 0.55, 'Core Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (49, 'SCIM Project Delivery', NULL, 8, 0.55, 'Core Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (50, 'Org Contributions', NULL, 8, 0.1, 'Org Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (51, 'Org Contributions', NULL, 8, 0.1, 'Org Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (52, 'Org Contributions', NULL, 8, 0.1, 'Org Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (53, 'Value Addition', NULL, 8, 0.1, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (54, 'Value Addition', NULL, 8, 0.1, 'Core Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (55, 'Value Addition', NULL, 8, 0.1, 'Core Contributions', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (56, 'Leave Management', NULL, 8, 0.1, 'Leave Management', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (57, 'Leave Management', NULL, 8, 0.1, 'Leave Management', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (58, 'Leave Management', NULL, 8, 0.1, 'Leave Management', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (59, 'Subjective Feedback', NULL, 8, 0.1, 'Subjective Feedback', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (60, 'Subjective Feedback', NULL, 8, 0.1, 'Subjective Feedback', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (61, 'Subjective Feedback', NULL, 8, 0.1, 'Subjective Feedback', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (71, 'VALUE ADDITION', 'Demonstrate 1 clear individual achievement or implemented process improvement automation with measurable impact across SCIM or ORG & 1 ideation with relevant artifacts.', 7, 0.1, 'Value Addition', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (72, 'VALUE ADDITION', 'Demonstrate 1 clear individual achievement or implemented process improvement automation with measurable impact across SCIM or ORG & 1 ideation with relevant artifacts.', 7, 0.1, 'Value Addition', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (73, 'VALUE ADDITION', 'Demonstrate 1 clear individual achievement or implemented process improvement automation with measurable impact across SCIM or ORG & 1 ideation with relevant artifacts.', 7, 0.1, 'Value Addition', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (74, 'SELF LEARNING & DEVELOPMENT', 'New Tech / Upskilling
Soft Skills - Communication(both written and verbal), Team Work, Problem Solving, Adaptability, Effective time management', 7, 0.05, 'Self Learning & Development', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (75, 'SELF LEARNING & DEVELOPMENT', 'New Tech / Upskilling
Soft Skills - Communication(both written and verbal), Team Work, Problem Solving, Adaptability, Effective time management', 7, 0.05, 'Self Learning & Development', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (76, 'SELF LEARNING & DEVELOPMENT', 'New Tech / Upskilling
Soft Skills - Communication(both written and verbal), Team Work, Problem Solving, Adaptability, Effective time management', 7, 0.05, 'Self Learning & Development', 'User', 'L3');
INSERT INTO public.items_to_rate VALUES (77, 'Leave Management', 'Maintain 3.5-4.5 leaves/quarter to ensure consistent team delivery and 85%+ productivity.', 7, 0.1, 'Core Contributions', 'User', 'L1');
INSERT INTO public.items_to_rate VALUES (78, 'Leave Management', 'Maintain 3.5-4.5 leaves/quarter to ensure consistent team delivery and 85%+ productivity.', 7, 0.1, 'Core Contributions', 'User', 'L2');
INSERT INTO public.items_to_rate VALUES (79, 'Leave Management', 'Maintain 3.5-4.5 leaves/quarter to ensure consistent team delivery and 85%+ productivity.', 7, 0.1, 'Core Contributions', 'User', 'L3');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: emp_user
--

INSERT INTO public.users VALUES ('e8fb749b-66d6-4fbc-b92d-d6ba9766cdf5', 'Dhaval Pathak', NULL, '$2a$12$m7LIE06Nbqws5iEazA8KkOpYOnERou8Q460pAQ16RsW6LKqz.frOy', 'dhavalpathak', 'dhavalpathak@google.com', NULL, 'User', 'L1', '2026-04-10 10:28:07.227067', 'dhavalpathak', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('0913fbe2-2553-466c-8a3d-681b8464e3bd', 'Radha Janapureddi', NULL, '$2a$12$RpZ1DoOgQnGviQw34v2fuOogp/9Ku66fmMOu4rVFP1CpSZXhsFzBO', 'janapureddi', 'janapureddi@google.com', NULL, 'User', 'L1', '2026-04-10 10:28:07.227067', 'janapureddi', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('e592d386-84ea-4f8b-a94d-26a63556e75f', 'Aniket Sharma', NULL, '$2a$12$zimuiWQ.FC62HWAjVBoQ/O7CJTdylKxyDbBaVZpuNiiFJiGXB.XYK', 'aniketksharma', 'aniketksharma@google.com', NULL, 'User', 'L1', '2026-04-10 10:28:07.227067', 'aniketksharma', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('74cd6f79-a981-4689-9501-91ce912b1475', 'Aradhya Teharia', NULL, '$2a$12$kKgVMgpU9HXgP25jEHe47e2vdu803lWYBYYUw2v52kKrzc5eDVstG', 'teharia', 'teharia@google.com', NULL, 'User', 'L1', '2026-04-10 10:28:07.227067', 'teharia', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('0752c611-d6c4-4b83-a11b-f3dfb3e4132f', 'Harshit Chaudhary', NULL, '$2b$12$5NQtIPOAurJ/IQtiGqHjwu3IoLoL/CktL/ApIHMAmpZ0qHhAphwVC', 'harshitch', 'chaudhary.harshit@highspring.in', 7, 'User', 'L3', '2026-04-10 10:28:07.227067', 'harshitch', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('733e60d2-ccd5-4752-af8e-d81eac1d1d8e', 'Arun Yadav', NULL, '$2a$12$aJ/QTNOeov3/p60RFhxN3eXZFj7iRZ0IWrZMqsdhqxGOnfPS2qk.2', 'arunya', 'arunya@google.com', 5, 'User', 'L1', '2026-04-10 10:28:07.227067', 'arunya', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('c92af833-fe08-435a-9694-f7c4f3b75a1a', 'Prasenjit Jana', NULL, '$2a$12$fg17HUsQCylvIYqNxlLUMeUKeazqLpkbLGMi/bX3CWjun1or/eTUC', 'prasenjitj', 'prasenjitj@google.com', NULL, 'Manager', 'N/A', '2026-04-10 10:17:10.436695', 'prasenjitj', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('a15f506f-db3c-4312-9dee-46ec76051b02', 'Mohit Panchal', NULL, '$2a$12$N2KqtxodyfVLTETDMf8Du.PfgSfBlY4XkVw18Q1viNWFdPWLp90xu', 'panchalmohit', 'panchalmohit@google.com', 7, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'panchalmohit', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('6dd04f02-409e-46a9-92c8-d426b5318eac', 'Akhil Bhatnagar', NULL, '$2a$12$RDQwVC4SK9y8pjrXhEJP1O3m2t9eEE2Q/LRbvV9W7W8ehyrQ.STci', 'akhilbhatnagar', 'akhilbhatnagar@google.com', 5, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'akhilbhatnagar', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('b39de1ac-4eb1-40c1-918a-e225bf7dbbb4', 'Sanu Bhattacharya', NULL, '$2a$12$r36Nj/reSl0vLs7alkUBAuDoas1/g0zDG2ygZA3tye8zTNyD1AV7y', 'sanub', 'sanub@google.com', 6, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'sanub', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('97321cb0-9ada-46ec-977d-f6fd06a313df', 'Pragya Sharma', NULL, '$2a$12$Btgq9nqxx3LGQjw6omjQpOXjsQLfMlcrffalYbi.yyHGjr/7SVLd6', 'pragyashar', 'pragyashar@google.com', 8, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'pragyashar', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('d8c6ae18-6b61-45ae-a9a8-b1b91248f9ea', 'Ritu Dua', NULL, '$2a$12$JEdoKp9rfCSwr.pt1.L5wesY7VgoDbiUIx3.bA6GQojPVtcexsoAG', 'ritudua', 'ritudua@google.com', 7, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'ritudua', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('c1286ee6-562b-4ac9-aedb-d1ad35df39f7', 'Anushri Bora', NULL, '$2a$12$HvUNdJJt2Wq4gaV2DWafQ.4vL8fP7ceJQnmRbm.TqmU5L.SHI0dgu', 'anushribora', 'anushribora@google.com', 8, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'anushribora', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('b51a742a-ec66-4fa3-8c06-4e524b0a5471', 'Anubhav Gaur', NULL, '$2a$12$PNgho/tEB93ODgkDAYA42ORk5VSTeDr44jlEMO9EQRjuVd.eh1Ac2', 'anubhavgaur', 'anubhavgaur@google.com', 5, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'anubhavgaur', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('27267a73-cc2c-447f-9f69-dab722038312', 'Ansh Khandelwal', NULL, '$2a$12$POTWPNZd6NNukBSV3CWvdekYJiNh8.GY9osKXrgImKWyXVlu2d8Qy', 'khandelwalansh', 'khandelwalansh@google.com', 6, 'Team Lead', 'N/A', '2026-04-10 10:17:10.436695', 'khandelwalansh', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('82e25474-224f-49db-8723-1cc29a33ca34', 'Muskan', NULL, '$2a$12$KeKcXAkUrMsDnvxbZxMPbu2i53KbLBpjVV4Ndp00MfvFH.ItEmQ72', 'mskan', 'mskan@google.com', NULL, 'User', 'L2', '2026-04-10 10:28:07.227067', 'mskan', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('826ac93b-5f67-437d-aa98-d320c53887e9', 'Sunny Kumar', NULL, '$2a$12$ALJoMiRhV/Wi6NVs0f5mhOdUUOADCoYRIVzI0e3O4Z06igR/59VX2', 'sssunnykumar', 'sssunnykumar@google.com', 5, 'User', 'L1', '2026-04-10 10:28:07.227067', 'sssunnykumar', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('6e7a1736-254c-4d2b-a043-7a7a6097d200', 'Dipti Sharma', NULL, '$2a$12$99j5geyoLWhSNjBKgxPihufhLAr.9rcOQvbhkRz9XU3BDOQcVzWky', 'diptisharma', 'diptisharma@google.com', 5, 'User', 'L1', '2026-04-10 10:28:07.227067', 'diptisharma', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('1fecb705-902a-431a-9c3d-5bf2b130d99a', 'Mangal Pandey', NULL, '$2a$12$nuO05JVYaSw/07K9b5PRzeWikN4H6XupDzkFfFnb4qTV/bCjFozO6', 'mangalpandey', 'mangalpandey@google.com', 8, 'User', 'L1', '2026-04-10 10:28:07.227067', 'mangalpandey', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('829ec004-de5c-4f50-b6b5-ca6ceb0a849e', 'Mehul Gautam', NULL, '$2a$12$MTyZjBWwUzQBMXiwBih/RuEI4mGkQdXulSMXbixKfFfnkdpAnS11S', 'mehulgautam', 'mehulgautam@google.com', 8, 'User', 'L1', '2026-04-10 10:28:07.227067', 'mehulgautam', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('68d2af10-8ab6-4c8e-864b-df76bdddf455', 'Sarandeep Singh', NULL, '$2a$12$PvArSAl5j/I5qjWojBNhh.7gRfGDXwtjt6uf5J5.AdymclZhnfxiG', 'sarandeepsingh', 'sarandeepsingh@google.com', 8, 'User', 'L1', '2026-04-10 10:28:07.227067', 'sarandeepsingh', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('1dada72c-26d2-4ef7-a766-97ffda1c78db', 'Vaibhav Rajoriya', NULL, '$2a$12$SKtL.V.TbIMmrVKxUO0tueK.ImiYUsakcYEcYFwZT1kQd9SmH3JNW', 'vrajoriya', 'vrajoriya@google.com', 8, 'User', 'L1', '2026-04-10 10:28:07.227067', 'vrajoriya', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('4499066c-68cf-4dcf-8c57-06f32544262e', 'Lakshay Arora', NULL, '$2a$12$Z.nS2CsNClfb.GrFUtoVuO.sG5YGOvWMgMIgBB.wcrkQv2gYQ3Hoe', 'aroral', 'aroral@google.com', 6, 'User', 'L1', '2026-04-10 10:28:07.227067', 'aroral', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('2721ab22-49b1-4f08-9829-7cddb467a729', 'Pratham Dahara', NULL, '$2a$12$T15smp.FnmhJScOZKmcoYOAhRmzm0VWezCnYl4jViMfLE1FHkrVyK', 'dahara', 'dahara@google.com', 6, 'User', 'L1', '2026-04-10 10:28:07.227067', 'dahara', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('e15f4d96-e332-41c1-8128-b2a87472bbff', 'Yash Bhardwaj', NULL, '$2a$12$VTEPn5nSb9q3Slr.0CpbOOFEsMlTSJULv.Rix2XtkpaEccKbrXjbm', 'yabhardwaj', 'yabhardwaj@google.com', 6, 'User', 'L3', '2026-04-10 10:28:07.227067', 'yabhardwaj', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('cf771807-1333-4344-a971-1b0689023f5f', 'Vageesha Choudhary', NULL, '$2a$12$vbDG21rGV.UO9c8Ac3SsWevxMuRaySHOtijJy.vTjutXIu9lqJM3a', 'vageesha', 'vageesha@google.com', 8, 'User', 'L2', '2026-04-10 10:28:07.227067', 'vageesha', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('654290d6-e7ab-4fe6-8632-bf45398154b4', 'Suraj Tiwari', NULL, '$2a$12$EsKiSSgf0z/shXJxE3lRau557N.H/41S0BQVwYwWwthhxFSY6yi.u', 'surajti', 'surajti@google.com', 6, 'User', 'L2', '2026-04-10 10:28:07.227067', 'surajti', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('33267e7f-d5e9-43af-b4bd-418566d34299', 'Abhishek Rawat', NULL, '$2a$12$a.e71OVg2T4KEuyH49HSY.MMPYWY0oM0fW/Q1oWHrZ7LWqf7lOq1m', 'abhishekraw', 'abhishekraw@google.com', 6, 'User', 'L2', '2026-04-10 10:28:07.227067', 'abhishekraw', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('16fe8f6e-ffeb-41d4-af29-af23b4e6b498', 'Vinayak Basant', NULL, '$2a$12$AriwgTwUEfChyY3ikaezNOYZoAFeyL2F.jqfocwSs11rQ6mZ6ls1W', 'vbasant', 'vbasant@google.com', 5, 'User', 'L2', '2026-04-10 10:28:07.227067', 'vbasant', 'SCIM', NULL, NULL);
INSERT INTO public.users VALUES ('35a0e1d4-b59b-4ea9-afb0-a61dd1d9df6b', 'Soumyajit Maity', NULL, '$2b$12$P1z7nRSw8./3re5jJWCEyOijZIh8DHsksNMBYTm5gfZEl9.rOpaFO', 'soumyajitmaity', 'soumyajit.maity@highspring.in', 7, 'User', 'L1', '2026-04-12 11:35:13.907582', NULL, 'SCIM', NULL, '2024-09-19');
INSERT INTO public.users VALUES ('7297db9e-c59b-478c-b711-873fb9fef444', 'Soumyajit Das', NULL, '$2b$12$N4S7oEok/GqZKHiU5eEl5uHcfzwAsdNVwp4yiYqwkzaC9UMigY/DG', 'soumyajitdas', 'soumyajit56340@gmail.com', NULL, 'User', 'L1', '2026-04-13 10:42:21.777827', NULL, 'SCIM', NULL, '2026-02-10');
INSERT INTO public.users VALUES ('8b2dd006-2cdf-4978-92bb-f0166caf1899', 'Ajay Jeet', NULL, '$2b$12$BO7zrLMtxqwZ05hFEOHgqOpnPnrqWCXTgsC9qHNvmJhsm4bsw4n4a', 'ajayj', 'chaudharyy.harshit@highspring.in', NULL, 'User', 'L1', '2026-04-13 10:43:58.763064', NULL, 'SCIM', 'EMP1091', '2026-04-13');


--
-- Name: items_to_rate_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: emp_user
--

SELECT pg_catalog.setval('public.items_to_rate_item_id_seq', 83, true);


--
-- Name: teams_team_id_seq; Type: SEQUENCE SET; Schema: public; Owner: emp_user
--

SELECT pg_catalog.setval('public.teams_team_id_seq', 8, true);


--
-- PostgreSQL database dump complete
--

\unrestrict utfbvmDuAF1Bd8ZPLhidTWDA7AkPYOJ2rPaxi1b6w9lI9ikUHMp5lRRJ75jb2ka

