(function () {
  window.LiveQuizSampleExam = {
    title: "Sample exam Live quiz",
    filename: "sample-exam-livequiz-template.csv",
    questions: [
      {
        prompt: "ชายอายุ 55 ปีได้รับ propranolol หลังเกิด myocardial infarction ข้อใดเป็นกลไกหลักที่ช่วยลดภาระงานของหัวใจ?",
        choices: [
          "กระตุ้น beta-1 receptor ที่ SA node",
          "ยับยั้ง beta-1 receptor ทำให้ heart rate และ contractility ลดลง",
          "ยับยั้ง alpha-1 receptor ทำให้หลอดเลือดหดตัว",
          "เพิ่มการหลั่ง renin จากไต",
          "กระตุ้น muscarinic receptor ที่หัวใจ"
        ],
        correctChoiceId: "B",
        explanation: "Beta-blocker ลด sympathetic drive ที่หัวใจ จึงลด heart rate, contractility และ oxygen demand.",
        timeLimitSeconds: 30
      },
      {
        prompt: "Atropine มีแนวโน้มทำให้เกิดอาการไม่พึงประสงค์ใดมากที่สุด?",
        choices: [
          "น้ำลายมากขึ้น",
          "รูม่านตาหดตัว",
          "ปากแห้งและมองใกล้ไม่ชัด",
          "หัวใจเต้นช้าลงอย่างเด่นชัด",
          "ท้องเสียจากการบีบตัวของลำไส้เพิ่มขึ้น"
        ],
        correctChoiceId: "C",
        explanation: "Atropine เป็น muscarinic antagonist จึงทำให้ secretions ลดลง, mydriasis และ cycloplegia.",
        timeLimitSeconds: 25
      },
      {
        prompt: "ยากลุ่มใดเหมาะกับการรักษา anaphylaxis แบบฉุกเฉินมากที่สุด?",
        choices: [
          "Epinephrine",
          "Pilocarpine",
          "Neostigmine",
          "Tamsulosin",
          "Scopolamine"
        ],
        correctChoiceId: "A",
        explanation: "Epinephrine กระตุ้น alpha และ beta receptors ช่วยเพิ่มความดัน ขยายหลอดลม และลด mediator release.",
        timeLimitSeconds: 20
      },
      {
        prompt: "ผู้ป่วย myasthenia gravis ได้รับ neostigmine ประโยชน์หลักเกิดจากข้อใด?",
        choices: [
          "ยับยั้ง acetylcholinesterase ทำให้ acetylcholine ที่ neuromuscular junction เพิ่มขึ้น",
          "ปิดกั้น nicotinic receptor ที่ motor end plate",
          "กระตุ้น dopamine receptor ใน basal ganglia",
          "ยับยั้งการสร้าง acetylcholine ใน presynaptic neuron",
          "กระตุ้น alpha-2 receptor เพื่อลด sympathetic outflow"
        ],
        correctChoiceId: "A",
        explanation: "Acetylcholinesterase inhibitor เพิ่ม acetylcholine ใน synaptic cleft จึงช่วยเพิ่มแรงกล้ามเนื้อ.",
        timeLimitSeconds: 35
      },
      {
        questionType: "short_answer",
        prompt: "Anatomy labeling: โครงสร้างที่รับเลือดแดงจาก pulmonary veins ก่อนส่งต่อไป left ventricle คืออะไร?",
        choices: [],
        acceptedAnswers: [
          "left atrium",
          "LA",
          "atrium sinistrum",
          "หัวใจห้องบนซ้าย"
        ],
        explanation: "Pulmonary veins เทเข้าสู่ left atrium จากนั้นเลือดผ่าน mitral valve ไป left ventricle.",
        timeLimitSeconds: 35
      },
      {
        prompt: "ยาข้อใดเป็น selective alpha-1 blocker ที่ใช้บรรเทาอาการของ benign prostatic hyperplasia?",
        choices: [
          "Phenylephrine",
          "Tamsulosin",
          "Dobutamine",
          "Bethanechol",
          "Pyridostigmine"
        ],
        correctChoiceId: "B",
        explanation: "Tamsulosin คลาย smooth muscle ใน prostate และ bladder neck ผ่าน alpha-1 blockade.",
        timeLimitSeconds: 25
      }
    ]
  };
})();
