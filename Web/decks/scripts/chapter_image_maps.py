"""Katzung figure/table → slide mappings (verified via OCR on screenshot files)."""

# Each entry: key -> (relative_path, caption)
# Keys are section numbers (int) or section ids (str) depending on deck layout.

CH1_BY_ID = {
    "definitions": ("data_1/01-fig-1-1.png", "FIGURE 1-1 — Major areas of study in pharmacology"),
    "major-divisions": ("data_1/01-fig-1-1.png", "FIGURE 1-1 — Major areas of study in pharmacology"),
    "drug-properties": ("data_1/04-table-1-2.png", "TABLE 1-2 — Dissociation constants (Kd) & stereochemistry"),
    "drug-receptor": ("data_1/05-fig-1-3.png", "FIGURE 1-3 — Agonist, antagonist & inverse agonist model"),
    "pharmacokinetics": ("data_1/07-fig-1-4.png", "FIGURE 1-4 — Mechanisms of drug permeation"),
    "weak-acids-bases": ("data_1/08-table-1-4.png", "TABLE 1-4 — Ionization constants (pKa) of common drugs"),
    "drug-development": ("data_1/11-fig-1-6.png", "FIGURE 1-6 — Drug development & testing (USA)"),
    "preclinical-safety": ("data_1/10-table-1-5.png", "TABLE 1-5 — Safety tests"),
    "fda-regulation": ("data_1/12-table-1-6.png", "TABLE 1-6 — Major drug legislation in the USA"),
    "orphan-drugs": ("data_1/12-table-1-6.png", "TABLE 1-6 — Orphan Drug Act & legislation"),
}

CH1_SUPPLEMENTS = {
    "drug-properties": ("data_1/02-table-1-1.png", "TABLE 1-1 — Development of large-molecule drugs"),
    "drug-receptor": ("data_1/03-fig-1-2.png", "FIGURE 1-2 — Drug–receptor interaction types"),
    "pharmacokinetics": ("data_1/06-table-1-3.png", "TABLE 1-3 — Transport proteins in pharmacology"),
    "weak-acids-bases": ("data_1/09-fig-1-5.png", "FIGURE 1-5 — Ion trapping of weak bases in urine"),
}

CH1_INTRO = ("data_1/01-fig-1-1.png", "FIGURE 1-1 — Introduction to pharmacology")

CH2_BY_NUM = {
    2: ("data_2/01-fig-2-1.png", "FIGURE 2-1 — EC50, Kd & receptor binding"),
    3: ("data_2/03-fig-2-2.png", "FIGURE 2-2 — Log dose axis & sigmoid dose–response"),
    4: ("data_2/05-fig-2-4.png", "FIGURE 2-4 — Spare receptors & partial agonist occupancy"),
    5: ("data_2/04-fig-2-3.png", "FIGURE 2-3 — Competitive antagonist shifts dose–response"),
    6: ("data_2/05-fig-2-4.png", "FIGURE 2-4 — Full vs partial agonist effects"),
    8: ("data_2/06-fig-2-5.png", "FIGURE 2-5 — Transmembrane signaling mechanisms"),
    9: ("data_2/08-fig-2-13.png", "FIGURE 2-13 — cAMP second messenger pathway"),
    10: ("data_2/07-fig-2-12.png", "FIGURE 2-12 — β-receptor desensitization & downregulation"),
    11: ("data_2/10-fig-2-15.png", "FIGURE 2-15 — Graded dose–response: potency vs efficacy"),
    12: ("data_2/11-fig-2-16.png", "FIGURE 2-16 — Quantal dose–effect plots"),
    14: ("data_2/10-fig-2-15.png", "FIGURE 2-15 — Selectivity and dose–response separation"),
}

CH2_SUPPLEMENTS = {
    8: ("data_2/02-table-2-1.png", "TABLE 2-1 — G proteins, receptors & signaling"),
    9: ("data_2/09-fig-2-14.png", "FIGURE 2-14 — Ca²⁺/phosphoinositide signaling pathway"),
}

CH2_INTRO = ("data_2/01-fig-2-1.png", "FIGURE 2-1 — Receptors & pharmacodynamics")

CH3_BY_NUM = {
    1: ("data_3/01-fig-3-1.png", "FIGURE 3-1 — Dose, concentration & effect (PK/PD)"),
    2: ("data_3/05-table-3-2.png", "TABLE 3-2 — Body compartment volumes (L/kg)"),
    3: ("data_3/04-fig-3-2.png", "FIGURE 3-2 — Elimination models (panels B & D)"),
    5: ("data_3/04-fig-3-2.png", "FIGURE 3-2 — First-order elimination compartments"),
    6: ("data_3/06-fig-3-3.png", "FIGURE 3-3 — Drug accumulation & elimination (half-lives)"),
    7: ("data_3/08-fig-3-4.png", "FIGURE 3-4 — Bioavailability: rate vs extent of absorption"),
    8: ("data_3/08-fig-3-4.png", "FIGURE 3-4 — First-pass effect lowers bioavailability"),
    9: ("data_3/07-table-3-3.png", "TABLE 3-3 — Routes of administration & bioavailability"),
    10: ("data_3/04-fig-3-2.png", "FIGURE 3-2 — Volume of distribution & loading dose"),
    11: ("data_3/10-fig-3-6.png", "FIGURE 3-6 — Dosing frequency vs plasma concentration"),
    12: ("data_3/01-fig-3-1.png", "FIGURE 3-1 — Concentration–effect relationship"),
    13: ("data_3/09-fig-3-5.png", "FIGURE 3-5 — Delayed drug effect (ACE inhibitor example)"),
    14: ("data_3/10-fig-3-6.png", "FIGURE 3-6 — Peak/trough fluctuations with dosing interval"),
    15: ("data_3/06-fig-3-3.png", "FIGURE 3-3 — Accumulation with repeated dosing"),
    16: ("data_3/10-fig-3-6.png", "FIGURE 3-6 — Target concentration strategy"),
    17: ("data_3/02-table-3-1.png", "TABLE 3-1 — PK/PD parameters (selected drugs)"),
    18: ("data_3/02-table-3-1.png", "TABLE 3-1 — Protein binding & drug parameters"),
    19: ("data_3/03-table-3-1.png", "TABLE 3-1 — PK/PD parameters (continued)"),
    20: ("data_3/03-table-3-1.png", "TABLE 3-1 — Digoxin & renal dosing parameters"),
    21: ("data_3/02-table-3-1.png", "TABLE 3-1 — High-yield PK/PD parameters"),
}

CH3_SUPPLEMENTS = {}

CH3_INTRO = ("data_3/01-fig-3-1.png", "FIGURE 3-1 — Pharmacokinetics & pharmacodynamics")

CH4_BY_NUM = {
    1: ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Phase I, phase II & direct elimination"),
    2: ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Why biotransformation is needed"),
    3: ("data_4/02-table-4-1.png", "TABLE 4-1 — Phase I reactions"),
    4: ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Sites of drug metabolism"),
    5: ("data_4/15-table-4-7.png", "TABLE 4-7 — Rapidly metabolized drugs (first-pass)"),
    6: ("data_4/07-fig-4-3.png", "FIGURE 4-3 — Cytochrome P450 catalytic cycle"),
    7: ("data_4/05-table-4-2.png", "TABLE 4-2 — Human liver P450s: substrates & interactions"),
    8: ("data_4/09-fig-4-4.png", "FIGURE 4-4 — Relative contributions of CYP pathways"),
    9: ("data_4/09-fig-4-4.png", "FIGURE 4-4 — Relative contributions of CYP and phase II pathways"),
    10: ("data_4/08-table-4-3.png", "TABLE 4-3 — Phase II conjugation reactions"),
    11: ("data_4/04-fig-4-2.png", "FIGURE 4-2 — Isoniazid hepatotoxic metabolite"),
    12: ("data_4/12-fig-4-5.png", "FIGURE 4-5 — Acetaminophen metabolism & toxicity"),
    13: ("data_4/10-table-4-4.png", "TABLE 4-4 — Genetic polymorphisms (phase I/II)"),
    14: ("data_4/10-table-4-4.png", "TABLE 4-4 — CYP polymorphisms & clinical effects"),
    15: ("data_4/11-table-4-4.png", "TABLE 4-4 — CYP2C19, CYP2C9, NAT2 polymorphisms"),
    16: ("data_4/11-table-4-4.png", "TABLE 4-4 — TPMT & UGT1A1 polymorphisms"),
    17: ("data_4/11-table-4-4.png", "TABLE 4-4 — NAT2 acetylator phenotype"),
    18: ("data_4/11-table-4-4.png", "TABLE 4-4 — TPMT & thiopurine toxicity"),
    19: ("data_4/11-table-4-4.png", "TABLE 4-4 — UGT1A1 & glucuronidation"),
    20: ("data_4/11-table-4-4.png", "TABLE 4-4 — BCHE & ester hydrolysis"),
    21: ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Gut microbiota & metabolism"),
    22: ("data_4/13-table-4-5.png", "TABLE 4-5 — Drugs that enhance or inhibit metabolism"),
    23: ("data_4/13-table-4-5.png", "TABLE 4-5 — Diet & environmental enzyme inducers"),
    24: ("data_4/13-table-4-5.png", "TABLE 4-5 — Disease effects on drug metabolism"),
    26: ("data_4/13-table-4-5.png", "TABLE 4-5 — Drug–drug metabolic interactions"),
    27: ("data_4/14-fig-4-6.png", "FIGURE 4-6 — Debrisoquin hydroxylation polymorphism"),
    28: ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Phase I, phase II & direct elimination overview"),
}

CH4_SUPPLEMENTS = {
    3: ("data_4/03-table-4-1.png", "TABLE 4-1 — Phase I reactions (continued)"),
    7: ("data_4/06-table-4-2.png", "TABLE 4-2 — CYP3A4 substrates, inducers & inhibitors"),
}

CH4_INTRO = ("data_4/01-fig-4-1.png", "FIGURE 4-1 — Drug biotransformation")

CH5_BY_NUM = {
    1: ("data_5/01-fig-5-1.png", "FIGURE 5-1 — Growth of pharmacogenomic testing"),
    2: ("data_5/02-table-5-1.png", "TABLE 5-1 — Major alleles & population frequencies"),
    3: ("data_5/01-fig-5-1.png", "FIGURE 5-1 — Pharmacogenomics & precision medicine"),
    4: ("data_5/02-table-5-1.png", "TABLE 5-1 — Phase I enzyme polymorphisms"),
    5: ("data_5/04-table-5-2.png", "TABLE 5-2 — Gene-based dosing (selected drugs)"),
    6: ("data_5/04-table-5-2.png", "TABLE 5-2 — CYP2C19 & clopidogrel dosing"),
    7: ("data_5/05-table-5-2.png", "TABLE 5-2 — CYP2B6 & related dosing"),
    8: ("data_5/05-table-5-2.png", "TABLE 5-2 — DPYD & fluoropyrimidine dosing"),
    9: ("data_5/04-table-5-2.png", "TABLE 5-2 — Phase II enzyme dosing recommendations"),
    10: ("data_5/04-table-5-2.png", "TABLE 5-2 — UGT1A1 & irinotecan dosing"),
    11: ("data_5/04-table-5-2.png", "TABLE 5-2 — TPMT & thiopurine dosing"),
    12: ("data_5/05-table-5-2.png", "TABLE 5-2 — NUDT15 & thiopurine myelotoxicity"),
    13: ("data_5/06-table-5-3.png", "TABLE 5-3 — G6PD deficiency classification"),
    14: ("data_5/04-table-5-2.png", "TABLE 5-2 — Transporter pharmacogenomics"),
    15: ("data_5/04-table-5-2.png", "TABLE 5-2 — SLCO1B1 & statin myopathy"),
    16: ("data_5/04-table-5-2.png", "TABLE 5-2 — ABCG2 (BCRP) variants"),
    17: ("data_5/04-table-5-2.png", "TABLE 5-2 — SLC22A1 (OCT1) variants"),
    18: ("data_5/07-table-5-4.png", "TABLE 5-4 — HLA alleles & drug hypersensitivity"),
    19: ("data_5/07-table-5-4.png", "TABLE 5-4 — HLA-B*57:01 & abacavir"),
    20: ("data_5/07-table-5-4.png", "TABLE 5-4 — HLA-B*15:02 & carbamazepine"),
    21: ("data_5/07-table-5-4.png", "TABLE 5-4 — HLA-B*58:01 & allopurinol"),
    22: ("data_5/07-table-5-4.png", "TABLE 5-4 — HLA-B*57:01 & flucloxacillin DILI"),
    23: ("data_5/04-table-5-2.png", "TABLE 5-2 — IFNL3/IL28B & hepatitis C response"),
    24: ("data_5/01-fig-5-1.png", "FIGURE 5-1 — Polygenic pharmacogenomic effects"),
    25: ("data_5/04-table-5-2.png", "TABLE 5-2 — CYP2C9 & warfarin dosing"),
    26: ("data_5/04-table-5-2.png", "TABLE 5-2 — VKORC1 & warfarin sensitivity"),
    27: ("data_5/01-fig-5-1.png", "FIGURE 5-1 — Epigenomics & drug response"),
    28: ("data_5/03-fig-5-2.png", "FIGURE 5-2 — Flucloxacillin DILI pharmacogenomics"),
    29: ("data_5/04-table-5-2.png", "TABLE 5-2 — Pharmacogenomics exam pearls"),
}

CH5_INTRO = ("data_5/01-fig-5-1.png", "FIGURE 5-1 — Pharmacogenomics overview")

CH6_BY_ID = {
    "1-core-concept": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Autonomic and somatic motor nerves"),
    "2-nervous-system-divisions": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — CNS, PNS & autonomic divisions"),
    "3-major-divisions-of-the-ans": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Organization of the autonomic nervous system"),
    "4-basic-autonomic-pathway": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Preganglionic & postganglionic pathways"),
    "5-sympathetic-anatomy": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Sympathetic motor pathways and adrenal medulla"),
    "6-parasympathetic-anatomy": ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Parasympathetic motor pathway comparison"),
    "7-enteric-nervous-system": ("data_6/03-fig-6-2.png", "FIGURE 6-2 — Enteric nervous system circuitry"),
    "8-neurotransmitters-in-the-ans": ("data_6/02-table-6-1.png", "TABLE 6-1 — Autonomic neurotransmitters"),
    "11-cholinergic-transmission": ("data_6/05-fig-6-3.png", "FIGURE 6-3 — Cholinergic junction (ACh synthesis & release)"),
    "14-adrenergic-transmission": ("data_6/07-fig-6-4.png", "FIGURE 6-4 — Noradrenergic junction (NE synthesis & storage)"),
    "18-catecholamine-metabolism": ("data_6/11-fig-6-6.png", "FIGURE 6-6 — Catecholamine metabolism (COMT & MAO)"),
    "19-autonomic-receptors": ("data_6/04-table-6-2.png", "TABLE 6-2 — Autonomic receptor types"),
    "21-muscarinic-receptors": ("data_6/04-table-6-2.png", "TABLE 6-2 — Muscarinic receptor signaling"),
    "22-nicotinic-receptors": ("data_6/04-table-6-2.png", "TABLE 6-2 — Nicotinic receptor effects"),
    "23-adrenoceptors": ("data_6/04-table-6-2.png", "TABLE 6-2 — Adrenoceptor subtypes"),
    "30-example-norepinephrine-infusion": ("data_6/12-fig-6-7.png", "FIGURE 6-7 — Autonomic control of cardiovascular function"),
    "33-ganglionic-transmission": ("data_6/13-fig-6-8.png", "FIGURE 6-8 — EPSP & IPSP at autonomic synapses"),
    "36-major-direct-effects-of-sympathetic-activity": ("data_6/06-table-6-3.png", "TABLE 6-3 — Direct sympathetic effects on organ systems"),
    "37-major-direct-effects-of-parasympathetic-activ": ("data_6/06-table-6-3.png", "TABLE 6-3 — Direct parasympathetic effects on organ systems"),
    "38-pharmacologic-targets-in-autonomic-transmissi": ("data_6/10-table-6-5.png", "TABLE 6-5 — Steps in autonomic transmission & drug effects"),
    "12-botulinum-toxin": ("data_6/14-fig-6-9.png", "FIGURE 6-9 — Anterior chamber: autonomic innervation"),
    "39-case-study-summary": ("data_6/14-fig-6-9.png", "FIGURE 6-9 — Botulinum toxin & autonomic targets"),
    "40-must-know-exam-pearls": ("data_6/04-table-6-2.png", "TABLE 6-2 — Autonomic receptors high-yield"),
}

CH6_SUPPLEMENTS = {
    "14-adrenergic-transmission": ("data_6/09-fig-6-5.png", "FIGURE 6-5 — Catecholamine biosynthesis"),
    "19-autonomic-receptors": ("data_6/08-table-6-4.png", "TABLE 6-4 — Autoreceptor & heteroreceptor effects"),
}

CH6_INTRO = ("data_6/01-fig-6-1.png", "FIGURE 6-1 — Autonomic pharmacology overview")

CH7_BY_ID = {
    "1-high-yield-summary": ("data_7/01-fig-7-1.png", "FIGURE 7-1 — Cholinomimetic drugs, receptors & tissues"),
    "2-core-concepts": ("data_7/02-table-7-1.png", "TABLE 7-1 — Cholinoceptor subtypes & characteristics"),
    "3-key-mechanisms-pathways": ("data_7/07-fig-7-4.png", "FIGURE 7-4 — Muscarinic & nicotinic signaling"),
    "4-important-drugs-molecules-systems": ("data_7/04-table-7-2.png", "TABLE 7-2 — Properties of choline esters"),
    "5-clinical-correlations": ("data_7/06-table-7-3.png", "TABLE 7-3 — Direct-acting cholinoceptor effects"),
    "6-adverse-effects-toxicity-pitfalls": ("data_7/10-fig-7-7.png", "FIGURE 7-7 — Organophosphate cholinesterase inhibitors"),
    "7-important-comparisons": ("data_7/12-summary.png", "Summary — cholinomimetic drugs compared"),
    "8-must-know-exam-points": ("data_7/02-table-7-1.png", "TABLE 7-1 — Cholinoceptors: exam points"),
    "9-case-based-integration": ("data_7/11-fig-7-8.png", "FIGURE 7-8 — Neuromuscular junction & ACh"),
    "10-rapid-review-table": ("data_7/12-summary.png", "Summary — cholinomimetic drugs"),
}

CH7_SUPPLEMENTS = {
    "3-key-mechanisms-pathways": ("data_7/03-fig-7-2.png", "FIGURE 7-2 — Structures of choline esters"),
    "4-important-drugs-molecules-systems": ("data_7/05-fig-7-3.png", "FIGURE 7-3 — Cholinomimetic alkaloid structures"),
    "5-clinical-correlations": ("data_7/08-fig-7-5.png", "FIGURE 7-5 — Endothelial muscarinic receptors & NO"),
    "6-adverse-effects-toxicity-pitfalls": ("data_7/09-fig-7-6.png", "FIGURE 7-6 — Cholinesterase inhibitors (neostigmine)"),
}

CH7_INTRO = ("data_7/01-fig-7-1.png", "FIGURE 7-1 — Cholinomimetics overview")

CH8_BY_ID = {
    "1-high-yield-summary": ("data_8/01-fig-8-1.png", "FIGURE 8-1 — M₁ receptor structural model"),
    "2-core-concepts": ("data_8/02-table-8-1.png", "TABLE 8-1 — Muscarinic subgroups & antagonists"),
    "3-key-mechanisms-pathways": ("data_8/03-fig-8-2.png", "FIGURE 8-2 — Atropine structure & muscarinic blockade"),
    "4-important-drugs-systems": ("data_8/04-table-8-2.png", "TABLE 8-2 — Antimuscarinic drugs in clinical use"),
    "5-clinical-correlations": ("data_8/07-fig-8-4.png", "FIGURE 8-4 — Atropine dose effects (HR & salivation)"),
    "6-adverse-effects-toxicity-pitfalls": ("data_8/08-fig-8-5.png", "FIGURE 8-5 — Systemic atropine effects"),
    "7-important-comparisons": ("data_8/06-table-8-3.png", "TABLE 8-3 — Antimuscarinic drugs (continued)"),
    "8-must-know-exam-points": ("data_8/02-table-8-1.png", "TABLE 8-1 — Muscarinic antagonists: exam points"),
    "9-case-based-integration": ("data_8/07-fig-8-4.png", "FIGURE 8-4 — Antimuscarinic dose–response in practice"),
    "10-rapid-review-table": ("data_8/10-summary.png", "Summary — anticholinergic (antimuscarinic) drugs"),
}

CH8_SUPPLEMENTS = {
    "3-key-mechanisms-pathways": ("data_8/05-fig-8-3.png", "FIGURE 8-3 — Semisynthetic & synthetic antimuscarinics"),
    "4-important-drugs-systems": ("data_8/06-table-8-3.png", "TABLE 8-3 — Antimuscarinic preparations"),
    "6-adverse-effects-toxicity-pitfalls": ("data_8/09-fig-8-6.png", "FIGURE 8-6 — Ganglion-blocking drugs"),
}

CH8_INTRO = ("data_8/01-fig-8-1.png", "FIGURE 8-1 — M1 receptor structural model")

CH9_BY_ID = {
    "1-high-yield-summary": ("data_9/02-table-9-1.png", "TABLE 9-1 — Adrenoceptor types and subtypes"),
    "2-core-concepts": ("data_9/06-table-9-3.png", "TABLE 9-3 — Distribution of adrenoceptor subtypes"),
    "3-key-mechanisms-pathways": ("data_9/01-fig-9-1.png", "FIGURE 9-1 — Activation of α₁ responses"),
    "4-important-drugs-molecules-systems": ("data_9/04-table-9-2.png", "TABLE 9-2 — Relative receptor affinities"),
    "5-clinical-correlations": ("data_9/11-fig-9-6.png", "FIGURE 9-6 — Hemodynamic effects of sympathomimetics"),
    "6-adverse-effects-toxicity-pitfalls": ("data_9/10-table-9-5.png", "TABLE 9-5 — Tyramine-rich foods (MAOI risk)"),
    "7-important-comparisons": ("data_9/08-table-9-4.png", "TABLE 9-4 — Cardiovascular responses to sympathomimetics"),
    "8-must-know-exam-points": ("data_9/13-fig-9-8.png", "FIGURE 9-8 — β₁- and β₂-selective agonists"),
    "9-case-based-integration": ("data_9/12-fig-9-7.png", "FIGURE 9-7 — Ganglionic blockade & phenylephrine"),
    "10-rapid-review-table": ("data_9/14-summary.png", "Summary — sympathomimetic drugs"),
}

CH9_SUPPLEMENTS = {
    "2-core-concepts": ("data_9/02-table-9-1.png", "TABLE 9-1 — Adrenoceptor G proteins & effects"),
    "3-key-mechanisms-pathways": ("data_9/03-fig-9-2.png", "FIGURE 9-2 — Adenylyl cyclase (β & α₂)"),
    "4-important-drugs-molecules-systems": ("data_9/07-fig-9-4.png", "FIGURE 9-4 — Catecholamine structures"),
    "5-clinical-correlations": ("data_9/09-fig-9-5.png", "FIGURE 9-5 — Noncatecholamine sympathomimetics"),
    "6-adverse-effects-toxicity-pitfalls": ("data_9/05-fig-9-3.png", "FIGURE 9-3 — Monoamine transporters (amphetamine & cocaine)"),
}

CH9_INTRO = ("data_9/02-table-9-1.png", "TABLE 9-1 — Adrenoceptor types and subtypes")

CH10_BY_ID = {
    "1-high-yield-summary": ("data_10/11-summary.png", "Summary — sympathetic antagonists"),
    "2-core-concepts": ("data_10/02-fig-10-2.png", "FIGURE 10-2 — Competitive vs irreversible α-blockade"),
    "3-key-mechanisms-pathways": ("data_10/04-fig-10-3.png", "FIGURE 10-3 — Phentolamine & epinephrine reversal"),
    "4-important-drugs": ("data_10/01-table-10-1.png", "TABLE 10-1 — Selectivity of adrenoceptor antagonists"),
    "5-clinical-correlations": ("data_10/06-fig-10-4.png", "FIGURE 10-4 — Phenoxybenzamine & orthostatic hypotension"),
    "6-adverse-effects-toxicity-pitfalls": ("data_10/08-fig-10-6.png", "FIGURE 10-6 — β-blockade & epinephrine risk"),
    "7-important-comparisons": ("data_10/03-table-10-2.png", "TABLE 10-2 — Beta-blocker properties"),
    "8-must-know-exam-points": ("data_10/10-fig-10-8.png", "FIGURE 10-8 — β-blocker therapy & survival"),
    "9-case-based-integration": ("data_10/09-fig-10-7.png", "FIGURE 10-7 — β-blocker effect on heart rate (IHD)"),
    "10-rapid-review-table": ("data_10/11-summary.png", "Summary — adrenoceptor antagonists"),
}

CH10_SUPPLEMENTS = {
    "4-important-drugs": ("data_10/07-fig-10-5.png", "FIGURE 10-5 — Propranolol & metoprolol structures"),
    "5-clinical-correlations": ("data_10/05-table-10-3.png", "TABLE 10-3 — Topical β-blockers for glaucoma"),
    "7-important-comparisons": ("data_10/02-fig-10-2.png", "FIGURE 10-2 — Antagonist type & dose–response"),
}

CH10_INTRO = ("data_10/01-table-10-1.png", "TABLE 10-1 — Adrenoceptor antagonists overview")

CHAPTER_CONFIG = {
    1: {"deck": "ch1-intro.json", "by_id": CH1_BY_ID, "supplements": CH1_SUPPLEMENTS, "intro": CH1_INTRO},
    2: {"deck": "ch2-receptors.json", "by_num": CH2_BY_NUM, "supplements": CH2_SUPPLEMENTS, "intro": CH2_INTRO},
    3: {"deck": "ch3-pk-pd.json", "by_num": CH3_BY_NUM, "supplements": CH3_SUPPLEMENTS, "intro": CH3_INTRO},
    4: {"deck": "ch4-biotransform.json", "by_num": CH4_BY_NUM, "supplements": CH4_SUPPLEMENTS, "intro": CH4_INTRO},
    5: {"deck": "ch5-pharmacogenomics.json", "by_num": CH5_BY_NUM, "supplements": {}, "intro": CH5_INTRO},
    6: {"deck": "ch6-autonomic.json", "by_id": CH6_BY_ID, "supplements": CH6_SUPPLEMENTS, "intro": CH6_INTRO},
    7: {"deck": "ch7-cholinomimetics.json", "by_id": CH7_BY_ID, "supplements": CH7_SUPPLEMENTS, "intro": CH7_INTRO},
    8: {"deck": "ch8-antimuscarinic.json", "by_id": CH8_BY_ID, "supplements": CH8_SUPPLEMENTS, "intro": CH8_INTRO},
    9: {"deck": "ch9-sympathomimetics.json", "by_id": CH9_BY_ID, "supplements": CH9_SUPPLEMENTS, "intro": CH9_INTRO},
    10: {
        "deck": "ch10-adrenoceptor-antagonists.json",
        "by_id": CH10_BY_ID,
        "supplements": CH10_SUPPLEMENTS,
        "intro": CH10_INTRO,
    },
}
