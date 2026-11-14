import { describe, expect, test } from "bun:test";
import { buildDictionary, buildExamples, buildPitch, type TermBankEntry } from "../scripts/build-data.ts";

// Trimmed from a real Jitendex term bank row (食べる).
const taberu: TermBankEntry = [
  "食べる",
  "たべる",
  "★",
  "v1",
  200,
  [
    {
      type: "structured-content",
      content: [
        {
          tag: "ul",
          data: { content: "sense-groups" },
          content: {
            tag: "li",
            data: { content: "sense-group" },
            content: [
              {
                tag: "span",
                data: { class: "tag", code: "v1", content: "part-of-speech-info" },
                content: "1-dan",
              },
              {
                tag: "span",
                data: { class: "tag", code: "vt", content: "part-of-speech-info" },
                content: "transitive",
              },
              {
                tag: "ol",
                content: [
                  {
                    tag: "li",
                    data: { content: "sense" },
                    content: [
                      { tag: "ul", data: { content: "glossary" }, content: { tag: "li", content: "to eat" } },
                      {
                        tag: "div",
                        data: { content: "extra-info" },
                        content: {
                          tag: "div",
                          data: { content: "example-sentence", source: "193344" },
                          content: [
                            {
                              tag: "div",
                              data: { content: "example-sentence-a" },
                              content: {
                                tag: "span",
                                content: [
                                  "もっと",
                                  { tag: "ruby", content: ["果", { tag: "rt", content: "くだ" }] },
                                  "を",
                                  {
                                    tag: "span",
                                    data: { content: "example-keyword" },
                                    content: [
                                      { tag: "ruby", content: ["食", { tag: "rt", content: "た" }] },
                                      "べる",
                                    ],
                                  },
                                  "べきです。",
                                ],
                              },
                            },
                            {
                              tag: "div",
                              data: { content: "example-sentence-b" },
                              content: [
                                { tag: "span", content: "You should eat more fruit." },
                                { tag: "span", data: { content: "attribution-footnote" }, content: "[1]" },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  {
                    tag: "li",
                    data: { content: "sense" },
                    content: [
                      {
                        tag: "ul",
                        data: { content: "glossary" },
                        content: [
                          { tag: "li", content: "to live on (e.g. a salary)" },
                          { tag: "li", content: "to live off" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        { tag: "div", data: { content: "attribution" }, content: "JMdict" },
      ],
    },
  ],
  1358280,
  "",
];

describe("buildDictionary", () => {
  test("flattens tags and glossary items", () => {
    expect(buildDictionary([taberu])).toEqual({
      食べる: [
        {
          w: "食べる",
          r: "たべる",
          ru: "v1",
          s: 200,
          t: ["1-dan", "transitive"],
          d: ["to eat", "to live on (e.g. a salary)", "to live off"],
        },
      ],
    });
  });
});

describe("buildExamples", () => {
  test("extracts the sentence with furigana and keyword span, drops footnotes", () => {
    expect(buildExamples([taberu])).toEqual({
      食べる: [
        {
          r: "たべる",
          e: [
            {
              j: [
                { t: "もっと" },
                { t: "果", r: "くだ" },
                { t: "を" },
                { t: "食", r: "た", k: true },
                { t: "べる", k: true },
                { t: "べきです。" },
              ],
              t: "You should eat more fruit.",
            },
          ],
        },
      ],
    });
  });
});

describe("buildPitch", () => {
  test("parses accents, kana-only rows, POS-qualified and duplicate rows", () => {
    const tsv = [
      "食べる\tたべる\t2",
      "ああ\t\t0",
      "２つ\tふたつ\t(副)0,(名)3",
      "βカロテン\tベータカロテン\t4",
      "βカロテン\tベータカロテン\t4",
      "",
    ].join("\n");
    expect(buildPitch(tsv)).toEqual({
      食べる: [{ r: "たべる", p: [2] }],
      ああ: [{ r: "ああ", p: [0] }],
      "２つ": [{ r: "ふたつ", p: [0, 3] }],
      "2つ": [{ r: "ふたつ", p: [0, 3] }],
      βカロテン: [{ r: "ベータカロテン", p: [4] }],
    });
  });
});
