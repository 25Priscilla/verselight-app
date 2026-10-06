import { describe, expect, it } from "vitest";
import { cleanKjvVerse, hasKjvMarkup } from "./kjvText";
import { slidesFor } from "./slides";
import type { Scripture } from "./types";

// Verses as they appear in the brace-marked KJV file (public domain).
describe("KJV brace markup", () => {
  it("keeps the words the translators supplied and drops only the braces", () => {
    expect(cleanKjvVerse("Blessed {is} the man unto whom the LORD imputeth not iniquity, and in whose spirit {there is} no guile."))
      .toBe("Blessed is the man unto whom the LORD imputeth not iniquity, and in whose spirit there is no guile.");
  });

  it("keeps a Psalm title and removes the margin note after the verse", () => {
    expect(cleanKjvVerse("[{A Psalm} of David, Maschil.] Blessed {is he whose} transgression {is} forgiven, {whose} sin {is} covered. {A Psalm...: or, A Psalm of David giving instruction}"))
      .toBe("[A Psalm of David, Maschil.] Blessed is he whose transgression is forgiven, whose sin is covered.");
  });

  it("removes every margin note at the end of a verse", () => {
    expect(cleanKjvVerse("And God saw the light, that {it was} good: and God divided the light from the darkness. {the light from...: Heb. between the light and between the darkness}"))
      .toBe("And God saw the light, that it was good: and God divided the light from the darkness.");
    expect(cleanKjvVerse("And God said, Let the waters bring forth abundantly the moving creature that hath life, and fowl {that} may fly above the earth in the open firmament of heaven. {moving: or, creeping} {life: Heb. soul} {fowl...: Heb. let fowl fly} {open...: Heb. face of the firmament of heaven}"))
      .toBe("And God said, Let the waters bring forth abundantly the moving creature that hath life, and fowl that may fly above the earth in the open firmament of heaven.");
    expect(cleanKjvVerse("Two {men} shall be in the field; the one shall be taken, and the other left. {this verse is not found in most of the Greek copies}"))
      .toBe("Two men shall be in the field; the one shall be taken, and the other left.");
  });

  it("keeps supplied words that contain a colon or end the sentence", () => {
    expect(cleanKjvVerse("And Laban said unto him, I pray thee, if I have found favour in thine eyes, {tarry: for} I have learned by experience that the LORD hath blessed me for thy sake."))
      .toBe("And Laban said unto him, I pray thee, if I have found favour in thine eyes, tarry: for I have learned by experience that the LORD hath blessed me for thy sake.");
    expect(cleanKjvVerse("But Jesus stooped down, and with {his} finger wrote on the ground, {as though he heard them not}."))
      .toBe("But Jesus stooped down, and with his finger wrote on the ground, as though he heard them not.");
  });

  it("removes a note after a verse that runs on without punctuation", () => {
    expect(cleanKjvVerse("What then? Israel hath not obtained that which he seeketh for; but the election hath obtained it, and the rest were blinded {blinded: or, hardened}"))
      .toBe("What then? Israel hath not obtained that which he seeketh for; but the election hath obtained it, and the rest were blinded");
  });

  it("copes with unmatched braces in the source", () => {
    expect(cleanKjvVerse("knowing in yourselves that ye have in heaven a better and an enduring substance. {in yourselves...: or, that ye have in or, for} yourselves}"))
      .toBe("knowing in yourselves that ye have in heaven a better and an enduring substance.");
    expect(cleanKjvVerse("To God only wise, {be} glory through Jesus Christ for ever. Amen. «{Written to the Romans from Corinthus, and sent} by Phebe servant of the church at Cenchrea.}»"))
      .toBe("To God only wise, be glory through Jesus Christ for ever. Amen. «Written to the Romans from Corinthus, and sent by Phebe servant of the church at Cenchrea.»");
  });

  it("leaves text without braces exactly as it is", () => {
    for (const t of ["In the beginning God created the heaven and the earth.", "LORD , how are they increased", "ആദിയിൽ ദൈവം ആകാശവും ഭൂമിയും സൃഷ്ടിച്ചു. "]) {
      expect(cleanKjvVerse(t)).toBe(t);
    }
  });

  it("gives the same text when applied twice", () => {
    const once = cleanKjvVerse("Blessed {is} the man. {man: Heb. one}");
    expect(cleanKjvVerse(once)).toBe(once);
  });

  it("tells whether a Bible uses the markup", () => {
    expect(hasKjvMarkup([{ chapters: [["plain"], ["Blessed {is} he"]] }])).toBe(true);
    expect(hasKjvMarkup([{ chapters: [["plain"]] }])).toBe(false);
  });
});

describe("passages saved in a service plan before the markup was tidied", () => {
  const passage = (source: Scripture["source"]): Scripture => ({
    kind: "scripture", id: "p", reference: "Genesis 1:4", translation: "KJV", attribution: "", versesPerSlide: 1, source, updatedAt: 0,
    verses: [{ ref: "Genesis 1:4", text: "And God saw the light, that {it was} good. {the light: Heb. between the light}" }],
    parallel: { translation: "MAL1910", attribution: "", lang: "ml", verses: [{ ref: "Genesis 1:4", text: "വെളിച്ചം നല്ലതു {എന്നു}" }] },
  });

  it("show the English verse as printed on the projector and leave the Malayalam side alone", () => {
    const [slide] = slidesFor(passage("bible-file"));
    expect(slide.lines).toEqual(["And God saw the light, that it was good."]);
    expect(slide.parallelLines).toEqual(["വെളിച്ചം നല്ലതു {എന്നു}"]);
  });

  it("leave text the user typed in themselves as typed", () => {
    expect(slidesFor(passage("manual"))[0].lines[0]).toContain("{it was}");
  });
});
