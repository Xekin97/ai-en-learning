// Fixed public samples from approved M002-UI-26. No user or operations fixtures.
export const sampleStories = [
  {
    title: "A story around the corner.",
    meaningWord: "weave",
    parts: [
      "Mia loved to ",
      {
        word: "wander",
      },
      " through the old town. One morning, a ",
      {
        word: "gentle",
      },
      " voice called from a tiny bookshop. She grew ",
      {
        word: "curious",
      },
      " and stepped inside. With ",
      {
        word: "steady",
      },
      " practice in its writing group, she learned to ",
      {
        word: "weave",
      },
      " small moments into stories. To her ",
      {
        word: "delight",
      },
      ", the little shop soon felt like home.",
    ],
    words: ["wander", "gentle", "curious", "steady", "weave", "delight"],
    meaning: {
      zh: "编织；将不同的事物交织在一起",
      en: "To interlace threads or combine different elements.",
      ja: "織る",
    },
  },
  {
    title: "A garden worth growing.",
    meaningWord: "resilient",
    parts: [
      "When a storm damaged Leo’s garden, he stayed ",
      {
        word: "resilient",
      },
      ". He planted new seeds and gave them ",
      {
        word: "gentle",
      },
      " care. With ",
      {
        word: "steady",
      },
      " effort, flowers began to ",
      {
        word: "bloom",
      },
      ". Soon, ",
      {
        word: "curious",
      },
      " neighbors stopped to help. To Leo’s ",
      {
        word: "delight",
      },
      ", the garden became a place where strangers shared stories and friendships grew.",
    ],
    words: ["resilient", "gentle", "steady", "bloom", "curious", "delight"],
    meaning: {
      zh: "有韧性的；遇到困难后仍能继续调整",
      en: "Able to recover and adapt after difficulty.",
      ja: "立ち直る力のある",
    },
  },
] as const;
