/**
 * The site in more than one language.
 *
 * Asked for 2026-09-05, with German first. What is translated is the site's own writing -- the
 * labels, the controls, the safety notice, the words that say how far a record has been checked.
 * What is not, and cannot be, is the standard: `L1`, `P2`, `α` and the rest are C.I.P.'s symbols
 * and a reader who knows the sheets has to find the same symbols here, which is the whole reason
 * the pages use them. Cartridge names are published names and stay as published. A German page is
 * this project speaking German about C.I.P.'s figures, not a translation of C.I.P.
 *
 * English is the source. Every key is declared on `en` and `de` is typed against it, so a message
 * added in one language and forgotten in the other is a build error rather than a blank on the
 * page; `t` falls back to English at runtime for the same reason, since a missing word should be
 * a word in the wrong language rather than a missing word.
 */

export type Lang = 'en' | 'de';

export const LANGS: Lang[] = ['en', 'de'];

/** Each language named in itself, which is how a reader who cannot read the other one finds it. */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch'
};

const STORAGE_KEY = 'lang';

/**
 * Which language to open in: the reader's stored choice, or their browser's, or English.
 *
 * The browser's preference is only consulted when nothing is stored, so a reader who picks English
 * on a German-language machine is not argued with on every visit.
 */
function initial(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'de') return stored;
  } catch {
    // Storage may be unavailable; the browser's own preference still applies.
  }
  try {
    const preferred = navigator.languages ?? [navigator.language];
    for (const tag of preferred) {
      const base = tag.toLowerCase().split('-')[0];
      if (base === 'de') return 'de';
      if (base === 'en') return 'en';
    }
  } catch {
    // No navigator (a build-time render); English.
  }
  return 'en';
}

let current = $state<Lang>(initial());

export function lang(): Lang {
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this visit.
  }
  // The document says what language it is in, which is what a screen reader and a translation
  // prompt both read; without it a German page announces itself as English.
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

const en = {
  // The masthead and the site-wide notice.
  'site.title': 'Cartridge & chamber dimensions',
  'site.home': 'Home',
  'site.skip': 'Skip to content',
  'site.light': '☀ Light',
  'site.dark': '☾ Dark',
  'site.toLight': 'Switch to light mode',
  'site.toDark': 'Switch to dark mode',
  'site.language': 'Language',
  'alert.title': 'Reference only - alpha',
  'alert.body':
    'Verify every figure against the official C.I.P. tables before machining a chamber, cutting a reamer, or loading ammunition. These pages are a convenience for reading published dimensions and are not a substitute for the standard.',
  'alert.alphaLead': 'This site is in development and at alpha status',
  'alert.alphaBody':
    ': it is an early, incomplete version, published so it can be checked and corrected. Expect errors, gaps and changes to the data, and treat nothing here as settled.',
  'footer.source':
    'Dimensions are specified by the {authority} and published in its {tables}. C.I.P. is the authority for these values. {independent}',
  'footer.authority': 'Permanent International Commission for the Proof of Small Arms (C.I.P.)',
  'footer.tables': 'Tables of Dimensions of Cartridges and Chambers',
  'footer.independent':
    'This site is independent and is not affiliated with, endorsed by, or published by C.I.P.',
  'footer.licence':
    'The dimensions themselves are technical facts and nobody’s property; no rights are claimed over them here, and none could be. Everything else, the records, the drawings and the code behind this site, is under the MIT licence.',

  // The list.
  'list.search': 'Search',
  'list.searchHint': '308, 7.62 x 51, 9 mm Luger…',
  'list.family': 'Family',
  'list.allFamilies': 'All families',
  'list.country': 'Country',
  'list.all': 'All',
  'list.verification': 'Verification',
  'list.any': 'Any',
  'list.sort': 'Sort',
  'list.count': '{shown} of {total} cartridges',
  'list.none': 'Nothing matches. {clear}',
  'list.clear': 'Clear the filters',
  'list.style': 'Drawing style',
  'list.view': 'View',
  'list.grid': 'Grid',
  'list.table': 'Table',
  'list.scale': 'Scale',
  'list.howFar': 'How far along',
  'list.confirmed': 'Confirmed',
  'list.toConfirm': 'Still to confirm',
  'list.plausibility': 'Plausibility',
  'list.hasChecks': 'Has open checks',
  'list.noChecks': 'No checks at all',
  'list.verifiedFacet': '{facet} verified',
  'list.unverifiedFacet': '{facet} unverified',
  'list.sortName': 'Name',
  'list.sortFamily': 'Family',
  'list.sortVerification': 'Verification',
  'list.sortCaseLength': 'Case length',
  'list.sortOverallLength': 'Overall length',
  'list.sortBullet': 'Bullet diameter',
  'list.gridView': 'Grid view',
  'list.listView': 'List view',
  'list.scaleNote': 'Drawing size, where 100% is the cartridge at life size',
  'list.emptyLead': 'Nothing matches.',
  'list.emptyBody':
    'The tables use C.I.P.’s own spelling, {a}, {b}, {c}, and the search also reads the alternative names each sheet lists.',

  // What is drawn, and how.
  'style.visual': 'Rendered',
  'style.technical': 'Technical',
  'style.visualNote': 'The cartridge as an object, in brass and copper',
  'style.technicalNote': 'The dimensioned drawing, with C.I.P.’s symbols',
  'subject.cartridge': 'Cartridge',
  'subject.chamber': 'Chamber',
  'draw.style': 'Style',
  'draw.length': 'Length',
  'draw.size': 'Size',
  'draw.published': 'Published',
  'draw.fit': 'Fit',
  'draw.smaller': 'Smaller',
  'draw.larger': 'Larger',
  'draw.reset': 'Reset to life size',
  'draw.drag': 'Drag to inspect an oversized drawing',
  'draw.missing': 'No {asked}{at}; showing the {shown}.',
  'draw.at': ' at {length}',
  'draw.smallSymbols':
    'Dimensioned drawings are at the size of the cartridge, so C.I.P.’s symbols are printed small; zoom in to read them, or print the page.',

  // How far a record has been checked.
  'verify.full': 'Fully verified',
  'verify.partial': 'Partly verified',
  'verify.none': 'Unverified',
  'verify.count': '{done} of {total} verified',
  'verify.means': '- verified means a person did proofread the data',
  'verify.status': 'Verification status',
  'verify.verified': 'verified',
  'verify.unverified': 'unverified',
  'verify.checks': 'Plausibility check',
  'verify.unexplained': '{count} unexplained',
  'verify.checkChip': '{count} check',
  'verify.checkChipPlural': '{count} checks',
  'verify.checkNote':
    '{count} plausibility findings nothing explains; see the cartridge page',
  'facet.cartridge': 'Cartridge',
  'facet.chamber': 'Chamber',
  'facet.cartridgeDrawing': 'Cartridge drawing',
  'facet.chamberDrawing': 'Chamber drawing',
  'facet.bullet': 'Bullet',
  'facetNote.cartridge': 'The cartridge’s published dimensions, proofread by a person',
  'facetNote.chamber': 'The chamber’s published dimensions, proofread by a person',
  'facetNote.cartridgeDrawing': 'The drawing of the cartridge, proofread by a person',
  'facetNote.chamberDrawing': 'The drawing of the chamber, proofread by a person',
  'facetNote.bullet': 'The drawn bullet’s nose form, proofread by a person',

  // The cartridge page.
  'record.alsoPublished': 'Also published as {names}',
  'record.method': 'Method',
  'record.published': 'Published',
  'record.revised': 'Revised',
  'record.key': 'Key',
  'record.cartridgeMaxi': 'Cartridge maxi',
  'record.chamberMini': 'Chamber mini',
  'record.bullet': 'Bullet as drawn',
  'record.shape': 'Shape',
  'record.category': 'Category',
  'record.ogive': 'Ogive',
  'record.base': 'Base',
  'record.tip': 'Tip',
  'record.notPublished': 'Not published',
  'record.loading': 'Loading {name}…',
  'record.back': 'Back to all cartridges',
  'record.report': 'Something look wrong?',

  // The families, as the tables group them.
  'family.rimless': 'Rimless',
  'family.rimmed': 'Rimmed',
  'family.belted': 'Belted',
  'family.pistol': 'Pistol & revolver',
  'family.rimfire': 'Rimfire',
  'family.shotshell': 'Shot cartridge',

  // The groups a sheet divides its figures into.
  'group.lengths': 'Lengths',
  'group.dimensions': 'Dimensions',
  'group.caseHead': 'Case Head',
  'group.powderChamber': 'Powder Chamber',
  'group.junctionCone': 'Junction Cone',
  'group.collar': 'Collar',
  'group.projectile': 'Projectile',
  'group.pressures': 'Pressures (Energies)',
  'group.misc': 'Miscellaneous Dimensions',
  'group.breech': 'Breech',
  'group.chamberLengths': 'Chamber Lengths',
  'group.rifling': 'Commencement of Rifling',
  'group.headspace': 'Headspace',
  'group.barrel': 'Barrel',
  'group.grooves': 'Grooves'
};

/**
 * German.
 *
 * The gun-trade words are the trade's own, not a dictionary's: `Patronenlager` for the chamber,
 * `Zündhütchen` for the primer, `Geschoss` for the bullet, `Hülse` for the case. C.I.P. publishes
 * its tables in German as well as French and English and those are the words its German pages use,
 * which is what a German reader of the sheets will be expecting to find here.
 */
const de: Record<keyof typeof en, string> = {
  'site.title': 'Patronen- und Lagermaße',
  'site.home': 'Start',
  'site.skip': 'Zum Inhalt springen',
  'site.light': '☀ Hell',
  'site.dark': '☾ Dunkel',
  'site.toLight': 'Zur hellen Ansicht wechseln',
  'site.toDark': 'Zur dunklen Ansicht wechseln',
  'site.language': 'Sprache',
  'alert.title': 'Nur zur Information - Alpha',
  'alert.body':
    'Prüfen Sie jede Angabe gegen die offiziellen C.I.P.-Tabellen, bevor Sie ein Patronenlager fertigen, eine Reibahle schneiden oder Munition laden. Diese Seiten erleichtern das Nachschlagen veröffentlichter Maße und ersetzen die Norm nicht.',
  'alert.alphaLead': 'Diese Website ist in Entwicklung und im Alpha-Stadium',
  'alert.alphaBody':
    ': eine frühe, unvollständige Fassung, veröffentlicht damit sie geprüft und berichtigt werden kann. Rechnen Sie mit Fehlern, Lücken und Änderungen an den Daten, und betrachten Sie nichts hier als endgültig.',
  'footer.source':
    'Die Maße werden von der {authority} festgelegt und in ihren {tables} veröffentlicht. Für diese Werte ist die C.I.P. maßgeblich. {independent}',
  'footer.authority':
    'Ständigen Internationalen Kommission für die Prüfung von Handfeuerwaffen (C.I.P.)',
  'footer.tables': 'Tabellen der Maße von Patronen und Patronenlagern',
  'footer.independent':
    'Diese Website ist unabhängig und steht in keiner Verbindung zur C.I.P., wird von ihr weder unterstützt noch herausgegeben.',
  'footer.licence':
    'Die Maße selbst sind technische Tatsachen und niemandes Eigentum; es werden hier keine Rechte an ihnen beansprucht, und es könnten auch keine bestehen. Alles Übrige, die Datensätze, die Zeichnungen und der Code hinter dieser Website, steht unter der MIT-Lizenz.',

  'list.search': 'Suche',
  'list.searchHint': '308, 7,62 x 51, 9 mm Luger…',
  'list.family': 'Bauart',
  'list.allFamilies': 'Alle Bauarten',
  'list.country': 'Land',
  'list.all': 'Alle',
  'list.verification': 'Prüfung',
  'list.any': 'Beliebig',
  'list.sort': 'Sortierung',
  'list.count': '{shown} von {total} Patronen',
  'list.none': 'Keine Treffer. {clear}',
  'list.clear': 'Filter zurücksetzen',
  'list.style': 'Zeichnungsart',
  'list.view': 'Ansicht',
  'list.grid': 'Kacheln',
  'list.table': 'Tabelle',
  'list.scale': 'Maßstab',
  'list.howFar': 'Stand der Prüfung',
  'list.confirmed': 'Bestätigt',
  'list.toConfirm': 'Noch zu bestätigen',
  'list.plausibility': 'Plausibilität',
  'list.hasChecks': 'Offene Prüfhinweise',
  'list.noChecks': 'Keine Prüfhinweise',
  'list.verifiedFacet': '{facet} geprüft',
  'list.unverifiedFacet': '{facet} ungeprüft',
  'list.sortName': 'Name',
  'list.sortFamily': 'Bauart',
  'list.sortVerification': 'Prüfung',
  'list.sortCaseLength': 'Hülsenlänge',
  'list.sortOverallLength': 'Gesamtlänge',
  'list.sortBullet': 'Geschossdurchmesser',
  'list.gridView': 'Kachelansicht',
  'list.listView': 'Listenansicht',
  'list.scaleNote': 'Zeichnungsgröße; 100 % ist die Patrone in Originalgröße',
  'list.emptyLead': 'Keine Treffer.',
  'list.emptyBody':
    'Die Tabellen verwenden die Schreibweise der C.I.P., {a}, {b}, {c}; die Suche liest außerdem die alternativen Bezeichnungen jedes Blattes.',

  'style.visual': 'Gerendert',
  'style.technical': 'Technisch',
  'style.visualNote': 'Die Patrone als Gegenstand, in Messing und Kupfer',
  'style.technicalNote': 'Die bemaßte Zeichnung, mit den Zeichen der C.I.P.',
  'subject.cartridge': 'Patrone',
  'subject.chamber': 'Patronenlager',
  'draw.style': 'Art',
  'draw.length': 'Länge',
  'draw.size': 'Größe',
  'draw.published': 'Veröffentlicht',
  'draw.fit': 'Einpassen',
  'draw.smaller': 'Kleiner',
  'draw.larger': 'Größer',
  'draw.reset': 'Auf Originalgröße zurücksetzen',
  'draw.drag': 'Ziehen, um eine übergroße Zeichnung zu betrachten',
  'draw.missing': 'Keine {asked}{at}; gezeigt wird die {shown}.',
  'draw.at': ' bei {length}',
  'draw.smallSymbols':
    'Bemaßte Zeichnungen haben die Größe der Patrone, daher sind die Zeichen der C.I.P. sehr klein; vergrößern Sie zum Lesen, oder drucken Sie die Seite.',

  'verify.full': 'Vollständig geprüft',
  'verify.partial': 'Teilweise geprüft',
  'verify.none': 'Ungeprüft',
  'verify.count': '{done} von {total} geprüft',
  'verify.means': '- geprüft heißt, eine Person hat die Daten Korrektur gelesen',
  'verify.status': 'Stand der Prüfung',
  'verify.verified': 'geprüft',
  'verify.unverified': 'ungeprüft',
  'verify.checks': 'Plausibilitätsprüfung',
  'verify.unexplained': '{count} ungeklärt',
  'verify.checkChip': '{count} Hinweis',
  'verify.checkChipPlural': '{count} Hinweise',
  'verify.checkNote':
    '{count} Plausibilitätshinweise, die nichts erklärt; siehe die Patronenseite',
  'facet.cartridge': 'Patrone',
  'facet.chamber': 'Patronenlager',
  'facet.cartridgeDrawing': 'Patronenzeichnung',
  'facet.chamberDrawing': 'Lagerzeichnung',
  'facet.bullet': 'Geschoss',
  'facetNote.cartridge':
    'Die veröffentlichten Maße der Patrone, von einer Person Korrektur gelesen',
  'facetNote.chamber':
    'Die veröffentlichten Maße des Patronenlagers, von einer Person Korrektur gelesen',
  'facetNote.cartridgeDrawing':
    'Die Zeichnung der Patrone, von einer Person Korrektur gelesen',
  'facetNote.chamberDrawing':
    'Die Zeichnung des Patronenlagers, von einer Person Korrektur gelesen',
  'facetNote.bullet':
    'Die Geschossspitze, wie gezeichnet, von einer Person Korrektur gelesen',

  'record.alsoPublished': 'Auch veröffentlicht als {names}',
  'record.method': 'Messverfahren',
  'record.published': 'Veröffentlicht',
  'record.revised': 'Überarbeitet',
  'record.key': 'Schlüssel',
  'record.cartridgeMaxi': 'Patrone maxi',
  'record.chamberMini': 'Patronenlager mini',
  'record.bullet': 'Geschoss, wie gezeichnet',
  'record.shape': 'Form',
  'record.category': 'Kategorie',
  'record.ogive': 'Ogive',
  'record.base': 'Boden',
  'record.tip': 'Spitze',
  'record.notPublished': 'Nicht veröffentlicht',
  'record.loading': '{name} wird geladen…',
  'record.back': 'Zurück zu allen Patronen',
  'record.report': 'Stimmt etwas nicht?',

  'family.rimless': 'Randlos',
  'family.rimmed': 'Mit Rand',
  'family.belted': 'Mit Gürtel',
  'family.pistol': 'Pistole & Revolver',
  'family.rimfire': 'Randfeuer',
  'family.shotshell': 'Schrotpatrone',

  'group.lengths': 'Längen',
  'group.dimensions': 'Maße',
  'group.caseHead': 'Hülsenboden',
  'group.powderChamber': 'Pulverraum',
  'group.junctionCone': 'Übergangskegel',
  'group.collar': 'Hülsenhals',
  'group.projectile': 'Geschoss',
  'group.pressures': 'Drücke (Energien)',
  'group.misc': 'Weitere Maße',
  'group.breech': 'Stoßboden',
  'group.chamberLengths': 'Lagerlängen',
  'group.rifling': 'Beginn der Züge',
  'group.headspace': 'Vorlauf',
  'group.barrel': 'Lauf',
  'group.grooves': 'Züge'
};

const MESSAGES: Record<Lang, Record<string, string>> = { en, de };

export type Key = keyof typeof en;

/**
 * One message in the reader's language.
 *
 * `{name}` in a message is replaced from `vars`, so a sentence stays one sentence in the
 * dictionary rather than being glued together from fragments in the markup -- word order is one of
 * the things that changes between languages, and a sentence assembled in the page can only ever
 * have English's.
 */
/**
 * A word dropped into the middle of a sentence.
 *
 * English lowercases a noun there and German does not -- `Verify cartridge` against
 * `Patrone pruefen` -- so the casing is a fact about the language and belongs here rather than in
 * a `.toLowerCase()` at the call site, which would be English's rule applied to every language.
 */
export function inSentence(word: string): string {
  return current === 'de' ? word : word.toLowerCase();
}

export function t(key: Key | (string & {}), vars?: Record<string, string | number>): string {
  const raw = MESSAGES[current][key] ?? (en as Record<string, string>)[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}
