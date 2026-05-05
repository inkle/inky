// bidi_and_tdd.ink — Inky Comprehensive Test Suite
//
// One file. All syntax. All RTL scripts. The full story.
// A time machine. A case for Agile TDD.
//
// Replaces the placeholder test.ink at app/renderer/test.ink
// Inky auto-loads this on `npm start`.
//
// Before bidifier: Hebrew text broken throughout → FAIL
// After bidifier:  Every line renders correctly → PASS
//
// Fixes: https://github.com/inkle/inky/issues/122
//
// SYNTAX COVERAGE: 28 Ink features × bilingual text
// SCRIPT COVERAGE: 10 Unicode RTL scripts
// NARRATIVE A: The 8-year story of #122 (no tests)
// NARRATIVE B: Time travel — Agile TDD from day one
//
// SETTINGS: lang (en/he/both), show_emoji (on/off)
//
// ── TRANSLATION SYSTEM ──
//
// Runtime:  t(he_text, en_text) function — switches on `lang` VAR
// Editor:   # lang_section tags — search "lang_section: <name>" to find
//           all translations for a logical block across languages.
//
//   Example: Search "lang_section: pitch_skeptic" to find the team's
//   skepticism text in both Hebrew and English.
//
//   Tags use snake_case names matching the narrative beat.
//   Format: # lang_section: <section_name>

// ════════════════════════════════════════
// 🎛️ GLOBALS
// ════════════════════════════════════════

VAR lang = "both"
VAR show_emoji = true
VAR health = 100
VAR gold = 50
VAR trust_level = 0
VAR visited_market = false
VAR bugs_found = 0
VAR bugs_fixed = 0
VAR years_passed = 0
VAR has_tests = false
VAR workarounds = 0
VAR chose_time_travel = false
VAR sprint_number = 0
VAR velocity = 0
VAR team_buy_in = 0
VAR reputation = 50
VAR rtl_users_gained = 0

CONST MAX_HEALTH = 100
CONST CITY_NAME = "ירושלים"

LIST mood = neutral, happy, sad, angry, terrified
LIST inventory = (nothing), sword, shield, potion, map, key

-> start

// ════════════════════════════════════════
// 🔧 FUNCTIONS
// ════════════════════════════════════════

=== function clamp(value, min_val, max_val) ===
{
  - value < min_val:
    ~ return min_val
  - value > max_val:
    ~ return max_val
  - else:
    ~ return value
}

=== function describe_health(hp) ===
{
  - hp > 80:
    ~ return "מצוין/Excellent"
  - hp > 50:
    ~ return "סביר/Okay"
  - hp > 20:
    ~ return "קשה/Struggling"
  - else:
    ~ return "גוסס/Dying"
}

=== function t(he_text, en_text) ===
{
  - lang == "he":
    ~ return he_text
  - lang == "en":
    ~ return en_text
  - else:
    ~ return he_text + " — " + en_text
}

// ════════════════════════════════════════
// 🏠 MAIN MENU
// ════════════════════════════════════════

=== start ===
# CLEAR

    ╔═══════════════════════════════════════════╗
    ║ {show_emoji: 🧪} Inky Test Suite              ║
    ║ {show_emoji: 🧪} חבילת בדיקות Inky             ║
    ║ inkle/inky\#122 — RTL Bidi Fix            ║
    ╚═══════════════════════════════════════════╝

{t("בחר:", "Choose:")}

* [{show_emoji: ⚙️} Settings — הגדרות] -> settings
* [{show_emoji: 🏃} Smoke Test — בדיקה מהירה] -> smoke_test
* [{show_emoji: 🔤} Syntax — 28 features — כל התחביר] -> syn_01
* [{show_emoji: 🌍} Bidi Museum — 10 RTL scripts — מוזיאון] -> museum
* [{show_emoji: 📖} TDD Story — סיפור הבאג] -> tdd_start
* [{show_emoji: ⏳} Time Travel — מסע בזמן] -> tt_intro

// ════════════════════════════════════════
// ⚙️ SETTINGS
// ════════════════════════════════════════

=== settings ===
# CLEAR
{show_emoji: ⚙️} {t("הגדרות", "Settings")}
{t("שפה:", "Lang:")} {lang} — {t("אימוג'י:", "Emoji:")} {show_emoji: ✅ | ❌}

+ [{show_emoji: 🇮🇱} עברית]
    ~ lang = "he"
    -> settings
+ [{show_emoji: 🇬🇧} English]
    ~ lang = "en"
    -> settings
+ [{show_emoji: 🌐} Both — שתיהן]
    ~ lang = "both"
    -> settings
+ [{show_emoji: 😀} Toggle emoji]
    ~ show_emoji = not show_emoji
    -> settings
+ [{show_emoji: ◀️} Back] -> start

// ════════════════════════════════════════
// 🏃 SMOKE TEST
// ════════════════════════════════════════

=== smoke_test ===
# CLEAR
{show_emoji: 🏃} {t("בדיקה מהירה", "Smoke Test")}

{lang != "en": שלום עולם.}
{lang != "he": Hello world.}
{lang != "en": הבחירה -> smoke_pass}
{lang == "en": The choice -> smoke_pass}

=== smoke_pass ===
* [{show_emoji: ✅} {t("תקין", "OK")}] {show_emoji: 🎉} -> start
* [{show_emoji: ❌} {t("שבור", "Broken")}] {show_emoji: 💔} -> start

// ════════════════════════════════════════
// 🔤 SYNTAX — 28 INK FEATURES × BIDI
// ════════════════════════════════════════

=== syn_01 ===
// 01. KNOTS + TEXT + DIVERTS — ===, ->
# CLEAR
{show_emoji: 🔤} 01/28 — {t("קשרים, טקסט, הפניות", "Knots, text, diverts")}
{t("זהו קשר ראשון. הסיפור מתחיל.", "First knot. Story begins.")}
-> syn_02

=== syn_02 ===
// 02. STITCHES — =, -> knot.stitch
= opening
{show_emoji: 🧵} 02/28 — {t("תפרים", "Stitches")}
{t("פתיחה.", "Opening.")}
-> syn_02.middle

= middle
{t("אמצע.", "Middle.")}
-> syn_03

=== syn_03 ===
// 03. CHOICES — *, +, []
{show_emoji: ⚔️} 03/28 — {t("בחירות", "Choices")}
* [{show_emoji: ⬅️} {t("שמאלה", "Left")}] {t("הרים.", "Mountains.")} -> syn_04
* {t("ימינה", "Right")} [{t("ונהר", "and river")}] {t("יער.", "Forest.")} -> syn_04
+ [{show_emoji: 🔄} {t("חזור", "Back")}] -> syn_03

=== syn_04 ===
// 04. NESTED CHOICES — ** ***
{show_emoji: 🔍} 04/28 — {t("בחירות מקוננות", "Nested choices")}
* [{show_emoji: 🔎} {t("חפש", "Search")}]
    ** [{show_emoji: 🗝️} {t("מפתח!", "Key!")}]
        ~ inventory += key
        *** [{show_emoji: ✊} {t("קח", "Take")}] -> syn_05
        *** [{show_emoji: 👋} {t("עזוב", "Leave")}] -> syn_05
    ** [{show_emoji: 🚶} {t("התעלם", "Ignore")}] -> syn_05
* [{show_emoji: ➡️} {t("המשך", "Continue")}] -> syn_05

=== syn_05 ===
// 05. GATHERS — -, - (label)
{show_emoji: 🤝} 05/28 — {t("נקודות איסוף", "Gathers")}
* [{show_emoji: ⬆️} {t("צפון", "North")}] {t("צפונה.", "North.")}
* [{show_emoji: ⬇️} {t("דרום", "South")}] {t("דרומה.", "South.")}
- {t("כל הדרכים מובילות לאותו מקום.", "All roads lead to same place.")}
- (reunion) {show_emoji: 🤝} {t("נפגשנו.", "Met.")} {CITY_NAME}.
-> syn_06

=== syn_06 ===
// 06. VARIABLES — ~, temp, +=, -=, ++
{show_emoji: 📊} 06/28 — {t("משתנים", "Variables")}
~ health = health - 10
~ gold += 25
~ visited_market = true
~ trust_level++
~ temp damage = 15
~ health = health - damage
{t("נזק:", "Damage:")} {damage}. {t("נותר:", "Left:")} {health}/{MAX_HEALTH}.
-> syn_07

=== syn_07 ===
// 07. CONDITIONALS — {cond: a | b}
{show_emoji: ❓} 07/28 — {t("תנאים", "Conditionals")}
{visited_market: {show_emoji: ✅} {t("ביקרת בשוק.", "Visited market.")}}
{health > 50: {show_emoji: 💪} {t("בריא", "Healthy")} | {show_emoji: 🤕} {t("פצוע", "Wounded")}}
-> syn_08

=== syn_08 ===
// 08. ALTERNATIVES — sequence, {&cycle}, {~shuffle}, {!once}
{show_emoji: 🎰} 08/28 — {t("חלופות", "Alternatives")}
{t("רצף:", "Seq:")} {t("ראשון", "1st")|t("שני", "2nd")|t("אחרון", "Last")}
{t("מחזור:", "Cycle:")} {&t("בוקר","AM")|t("ערב","PM")}
{t("אקראי:", "Shuffle:")} {~t("שמש","Sun")|t("גשם","Rain")|t("שלג","Snow")}
-> syn_09

=== syn_09 ===
// 09. GLUE — <>
{show_emoji: 🔗} 09/28 — {t("דבק", "Glue")}
{t("הלכנו", "We went")} <>
-> syn_09b

=== syn_09b ===
<> {t("במהירות הביתה.", "quickly home.")}
-> syn_10

=== syn_10 ===
// 10. TAGS — #
# BGM: BGM_MARKET
{show_emoji: 🏷️} 10/28 — {t("תגיות", "Tags")}
{t("שוק.", "Market.")} # location: market # mood: busy
-> syn_11

=== syn_11 ===
// 11. KNOT PARAMETERS — (param)
{show_emoji: 👋} 11/28 — {t("פרמטרים", "Parameters")}
-> syn_greet("אבי/Avi", 42)

=== syn_greet(name, age) ===
{t("שלום", "Hello")} {name}! {t("בן", "Age:")} {age}.
-> syn_12

=== syn_12 ===
// 12. FUNCTIONS — === function ===, ~ return
{show_emoji: 🔢} 12/28 — {t("פונקציות", "Functions")}
~ health = clamp(health, 0, MAX_HEALTH)
{t("מצב:", "Status:")} {describe_health(health)}
-> syn_13

=== syn_13 ===
// 13. TUNNELS — -> tunnel ->, ->->
{show_emoji: 🚇} 13/28 — {t("מנהרות", "Tunnels")}
{t("לפני.", "Before.")}
-> syn_dream ->
{t("אחרי.", "After.")}
-> syn_14

=== syn_dream ===
{show_emoji: 💭} {t("חלום.", "Dream.")}
* [{show_emoji: ⏰} {t("התעורר", "Wake")}] ->->
* [{show_emoji: 💤} {t("המשך", "Continue")}] {t("...ואז התעוררת.", "...then woke.")} ->->

=== syn_14 ===
// 14. THREADS — <-
{show_emoji: 🏛️} 14/28 — {t("חוטים", "Threads")}
{t("כיכר העיר.", "Town square.")}
<- syn_thread_a
<- syn_thread_b
* [{show_emoji: 🚪} {t("עזוב", "Leave")}] -> syn_15

=== syn_thread_a ===
* [{show_emoji: 🍎} {t("פירות", "Fruit")}] {t("תפוחים.", "Apples.")} -> DONE

=== syn_thread_b ===
* [{show_emoji: 👂} {t("שמועות", "Gossip")}] {t("אוצר נסתר.", "Hidden treasure.")} -> DONE

=== syn_15 ===
// 15. LISTS — LIST, ?, !?, +=, -=
{show_emoji: 🎒} 15/28 — {t("רשימות", "Lists")}
~ mood = happy
~ inventory += potion
{inventory ? sword: {show_emoji: ⚔️} {t("יש חרב!", "Sword!")} | {show_emoji: ❌} {t("אין.", "None.")}}
{inventory !? map: {show_emoji: ❌} {t("אין מפה.", "No map.")} | {show_emoji: 🗺️}}
~ inventory -= nothing
~ inventory += map
{t("ציוד:", "Inv:")} {inventory}
-> syn_16

=== syn_16 ===
// 16. VARIABLE DIVERTS — ~ temp target = -> knot
{show_emoji: 🎯} 16/28 — {t("הפניות משתנות", "Var diverts")}
~ temp target = -> syn_17
-> target

=== syn_17 ===
// 17. VISIT COUNTS + TURNS_SINCE
{show_emoji: 🔢} 17/28 — {t("ספירת ביקורים", "Visit counts")}
{t("ביקורים:", "Visits:")} {syn_17}
{TURNS_SINCE(-> syn_01) > 0: {show_emoji: ⏱️} {t("עברו תורות.", "Turns passed.")}}
-> syn_18

=== syn_18 ===
// 18. CONDITIONAL CHOICES — * {cond} [text]
{show_emoji: ❓} 18/28 — {t("בחירות מותנות", "Conditional choices")}
* {inventory ? sword} [{show_emoji: ⚔️} {t("חרב", "Sword")}] {t("נפת!", "Swung!")} -> syn_19
* {inventory ? potion} [{show_emoji: 🧪} {t("שיקוי", "Potion")}]
    ~ health = clamp(health + 30, 0, MAX_HEALTH)
    ~ inventory -= potion
    {show_emoji: 💚} {health} -> syn_19
* [{show_emoji: 🚶} {t("המשך", "Go")}] -> syn_19

=== syn_19 ===
// 19. MULTI-LINE CONDITIONALS — { - cond: }
{show_emoji: 😊} 19/28 — {t("תנאים מרובי שורות", "Multi-line cond")}
{
  - mood == happy: {show_emoji: 😊} {t("מחייך.", "Smiling.")}
  - mood == sad: {show_emoji: 😢} {t("עצוב.", "Sad.")}
  - else: {show_emoji: 😐} {t("רגיל.", "Normal.")}
}
-> syn_20

=== syn_20 ===
// 20. STRING OPS — == with Hebrew
{show_emoji: 💬} 20/28 — {t("מחרוזות", "Strings")}
{lang == "he": {show_emoji: 🇮🇱} {t("עברית.", "Hebrew.")}}
~ temp greeting = "שלום לכולם"
{t("ברכה:", "Greeting:")} {greeting}
-> syn_21

=== syn_21 ===
// 21. MATH — + - * / % mod
{show_emoji: 🧮} 21/28 — {t("מתמטיקה", "Math")}
~ temp a = 10
~ temp b = 3
{a}+{b}={a+b}, {a}-{b}={a-b}, {a}*{b}={a*b}, {a}/{b}={a/b}, {a}%{b}={a mod b}
-> syn_22

=== syn_22 ===
// 22. LOGIC — and, or, not, !=, <=, >=
{show_emoji: 🧠} 22/28 — {t("לוגיקה", "Logic")}
{health > 0 and gold > 0: {show_emoji: ✅} {t("חיים + כסף", "Health + gold")}}
{not visited_market: {show_emoji: 🏪} {t("לא ביקרת.", "Not visited.")}}
{health != MAX_HEALTH: {show_emoji: 💔} {t("לא מלא.", "Not full.")}}
{trust_level >= 1: {show_emoji: 🤝} {t("אמון.", "Trust.")}}
-> syn_23

=== syn_23 ===
// 23. COMMENTS — //, /* */
{show_emoji: 💬} 23/28 — {t("הערות", "Comments")}
// הערה בעברית — Hebrew comment
/* הערת בלוק בעברית
   Block comment */
-> syn_24

=== syn_24 ===
// 24. TODO
{show_emoji: 📋} 24/28 — TODO
// TODO: הוסף ערבית — Add Arabic
-> syn_25

=== syn_25 ===
// 25. ESCAPING — \{ \} \[ \]
{show_emoji: 🔤} 25/28 — {t("תווים מיוחדים", "Escaping")}
{t("סימנים:", "Symbols:")} \{ \} \[ \]
-> syn_26

=== syn_26 ===
// 26. INCLUDE (display only)
{show_emoji: 📎} 26/28 — INCLUDE
// INCLUDE קובץ_נוסף.ink
{t("(תצוגה בלבד)", "(Display only)")}
-> syn_27

=== syn_27 ===
// 27. MID-SENTENCE DIVERTS + GLUE CHAINS — inline ->, <>
{show_emoji: ⛓️} 27/28 — {t("שרשרת הפניות", "Divert chains")}
{t("הלכנו", "We walked")} -> syn_27b

=== syn_27b ===
<> {t("אל העיר", "to the city")} -> syn_27c

=== syn_27c ===
<> {t("העתיקה", "ancient")} {CITY_NAME}.
-> syn_28

=== syn_28 ===
// 28. ENDING + SUMMARY
# CLEAR
{show_emoji: 📋} 28/28 — {t("סיכום", "Summary")}
{show_emoji: 👤} {health}/{MAX_HEALTH} {describe_health(health)}
{show_emoji: 💰} {gold} — {show_emoji: 🎒} {inventory} — {show_emoji: 😊} {mood}
{show_emoji: 🏙️} {CITY_NAME} — {show_emoji: 🔢} {t("ביקורים:", "Visits:")} {syn_17}

{show_emoji: 🎉} 28/28 {t("תכונות נבדקו!", "features tested!")}

* [{show_emoji: 🏠} {t("תפריט", "Menu")}] -> start
* [{show_emoji: 🔚} {t("סיים", "End")}] -> END

// ════════════════════════════════════════
// 🌍 BIDI MUSEUM — 10 RTL SCRIPTS
// ════════════════════════════════════════

=== museum ===
# lang_section: museum_entrance
# CLEAR
{show_emoji: 🌍} {t("מוזיאון באגי הביד\"י", "Bidi Bug Museum")} — \#122

* [{show_emoji: 🇮🇱} Hebrew] -> m_he
* [{show_emoji: 🇸🇦} Arabic] -> m_ar
* [{show_emoji: 🇮🇷} Persian] -> m_fa
* [{show_emoji: 🇵🇰} Urdu] -> m_ur
* [{show_emoji: ✡️} Yiddish] -> m_yi
* [{show_emoji: 🌍} All 10] -> m_all
* [{show_emoji: ◀️} Back] -> start

=== m_he ===
שלום עולם. הבחירה -> m_check
=== m_ar ===
مرحبا بالعالم. الاختيار -> m_check
=== m_fa ===
سلام دنیا. انتخاب -> m_check
=== m_ur ===
ہیلو دنیا. انتخاب -> m_check
=== m_yi ===
שלום וועלט. די ברירה -> m_check

=== m_check ===
* [{show_emoji: ✅} {t("תקין", "OK")}] -> museum
* [{show_emoji: ❌} {t("שבור", "Broken")}] -> museum

=== m_all ===
# lang_section: museum_all_scripts
# CLEAR
{show_emoji: 🇮🇱} Hebrew: שלום עולם. הבחירה
{show_emoji: 🇸🇦} Arabic: مرحبا بالعالم. الاختيار
{show_emoji: 🇮🇷} Persian: سلام دنیا. انتخاب
{show_emoji: 🇵🇰} Urdu: ہیلو دنیا. انتخاب
{show_emoji: ✡️} Yiddish: שלום וועלט. די ברירה
{show_emoji: 🏛️} Syriac: ܫܠܡܐ ܥܠܡܐ. ܓܒܝܬܐ
{show_emoji: 🇲🇻} Thaana: ހެލޯ ވޯލްޑް. ޗޮއިސް
{show_emoji: 🌍} N'Ko: ߊߟߎ ߘߎߢߊ. ߛߎߥߊߟߌ
{show_emoji: 📜} Samaritan: ࠔࠋࠌ ࠏࠋࠌ. ࠁࠇࠓࠕ
{show_emoji: 📜} Mandaic: ࡔࡋࡀࡌࡀ. ࡂࡀࡁࡉࡀ

* [{show_emoji: ✅} {t("הכל תקין — PASS", "All OK — PASS")}] {show_emoji: 🎉} -> museum
* [{show_emoji: ❌} {t("שבור — FAIL", "Broken — FAIL")}] {show_emoji: 💔} -> museum

// ════════════════════════════════════════
// 📖 TDD STORY — THE UNTESTED EDITOR
// ════════════════════════════════════════

=== tdd_start ===
# CLEAR
# lang_section: tdd_opening

    ╔═══════════════════════════════════════╗
    ║ {show_emoji: 📖} {t("עוֹרֵך בְּלִי בְּדִיקוֹת", "THE UNTESTED EDITOR")}    ║
    ║ {t("סיפור על מה שלא נתפס", "What doesn't get caught")}    ║
    ╚═══════════════════════════════════════╝

{t("השנה 2016. אתם צוות קטן בקיימברידג'.", "2016. Small team in Cambridge.")}
{t("בניתם עורך אלגנטי. קראתם לו Inky.", "Built an elegant editor. Called it Inky.")}
{t("יש דבר אחד שלא הוספתם.", "One thing you didn't add.")}

* [{show_emoji: ❓} {t("מה?", "What?")}]
    {show_emoji: 🧪} {t("בדיקות.", "Tests.")}
    {t("test.js ריק. test.ink — שורה אחת.", "test.js is empty. test.ink — one line.")}
    -> tdd_17
* [{show_emoji: 🚀} {t("שלח!", "Ship it!")}]
    ~ workarounds += 1
    {t("הכל עובד. באנגלית.", "Everything works. In English.")}
    -> tdd_17

=== tdd_17 ===
# CLEAR
# lang_section: tdd_year_2017
~ years_passed = 1
~ bugs_found += 1
{show_emoji: 📅} ══ 2017 ══
{t("מישהו פותח issue \#122.", "Someone opens \#122.")}
  "Cannot use Right-to-Left languages with Inky properly."
~ workarounds += 1
{t("התגובה: 'בינתיים, כתבו ב-VS Code.'", "Response: 'For now, use VS Code.'")}

* [{show_emoji: 🤷} {t("עקיפה סבירה.", "Reasonable.")}]
    {t("סבירה — לאדם בודד. עקיפה היא מכסה.", "For one person. A workaround is a toll.")}
    -> tdd_20
* [{show_emoji: 😤} {t("זו ויתור.", "That's giving up.")}]
    {t("המסר: העורך לא בשבילך.", "Message: this editor isn't for you.")}
    -> tdd_20

=== tdd_20 ===
~ years_passed = 4
# lang_section: tdd_year_2020
{show_emoji: 📅} ══ 2020 ══
{t("מישהו כותב: כל התחביר מתוכנן כ-LTR.", "Someone writes: the syntax is thought LTR.")}
{show_emoji: 💡} {t("התובנה הכי קרובה.", "Closest insight.")}
{t("הדייוורט הוא ניטרלי, לא LTR. זה מסווג חסר, לא פגם.", "The divert is neutral, not LTR. Missing classifier, not flaw.")}
{t("יוניקוד 6.3 פתר את זה ב-2013. שלושה תווים.", "Unicode 6.3 solved this in 2013. Three chars.")}

* [{show_emoji: ❓} {t("למה אף אחד לא חיבר?", "Why nobody connected?")}]
    {t("מי שמכיר ביד\"י לא משתמש ב-Ink. מי שמשתמש ב-Ink לא מכיר ביד\"י.", "Bidi experts don't use Ink. Ink users don't know bidi.")}
    {show_emoji: 🤝} {t("בדיקה היא נקודת מפגש.", "A test is a meeting point.")}
    -> tdd_24

=== tdd_24 ===
~ years_passed = 8
{show_emoji: 📅} ══ 2024 ══
{t("\#122 פתוח. אין PR. 8 שנים.", "\#122 open. No PR. 8 years.")}
{t("הכלים קיימים. הבדיקות לא.", "Tools exist. Tests don't.")}

* [{show_emoji: 🧪} {t("מה אם הייתה בדיקה אחת?", "What if one test?")}]
    assert( baseDirection('שלום') === 'rtl' )
    {t("שבע מילים. הייתה נכשלת מיד ב-2016.", "Seven words. Would have failed in 2016.")}
    -> tdd_fix
* [{show_emoji: ⏳} {t("מה אם היינו חוזרים ל-2016?", "What if we went back to 2016?")}]
    ~ chose_time_travel = true
    -> tt_intro

=== tdd_fix ===
# CLEAR
# lang_section: tdd_the_fix
~ bugs_fixed = 1
{show_emoji: 🔧} ══ {t("התיקון", "THE FIX")} ══

{t("40 שורות. פונקציה טהורה.", "40 lines. Pure function.")}

  ScriptRun("הבחירה → next")
  → Run 0: "הבחירה "   Hebrew  RTL
  → Run 1: "→ "        Common  Inherit
  → Run 2: "next"      Latin   LTR

  → RLI+"הבחירה "+PDI + "→ " + LRI+"next"+PDI

{show_emoji: ✨} {t("שלושה תווים לכל מעבר. Ace לא משתנה. Ink לא משתנה.", "Three chars per transition. Ace untouched. Ink untouched.")}

* [{show_emoji: 📝} {t("הלקח?", "Lesson?")}] -> tdd_lesson

=== tdd_lesson ===
# CLEAR
# lang_section: tdd_lesson

    ╔═══════════════════════════════════════╗
    ║ {show_emoji: 📝} {t("הלקח", "THE LESSON")}                   ║
    ╚═══════════════════════════════════════╝

{show_emoji: 🎯} TDD {t("לא תופס באגים. TDD הופך באגים לניתנים לתפיסה.", "doesn't catch bugs. TDD makes bugs catchable.")}

{show_emoji: ✅} {t("באגים שנמצאים — מתוקנים.", "Found bugs get fixed.")}
{show_emoji: 🔄} {t("באגים עם עקיפות — מקבלים הערות.", "Workaround bugs get comments.")}

{show_emoji: 💎} {t("התיקון: 40 שורות. הבדיקה: 7 מילים. המחיר: 8 שנים.", "Fix: 40 lines. Test: 7 words. Cost: 8 years.")}

{show_emoji: ❤️} {t("כתוב את הבדיקה קודם כי אכפת לך מהאנשים שישתמשו.", "Write the test first because you care about the people who'll use it.")}

{show_emoji: 👂} {t("בדיקה שומעת שתיקה.", "A test hears silence.")}

* [{show_emoji: 🏠} {t("תפריט", "Menu")}] -> start
* [{show_emoji: ⏳} {t("מסע בזמן — נסה אג'ייל", "Time Travel — try Agile")}] -> tt_intro
* [{show_emoji: 🔚} {t("סיים", "End")}] -> END

// ════════════════════════════════════════════════════════════
// ⏳ TIME TRAVEL — AGILE TDD FROM DAY ONE
// ════════════════════════════════════════════════════════════
//
// The player travels back to 2016 and convinces the Inky team
// to adopt Agile with TDD. Each knot teaches a real ceremony,
// shows the 2x effort cost, and then the compound payoff.
//
// Agile concepts covered:
//   Sprint 0, Product Backlog, User Stories, Definition of Done,
//   Sprint Planning, Daily Standup, TDD (Red/Green/Refactor),
//   Sprint Review, Sprint Retrospective, CI/CD, Velocity,
//   Stakeholder trust, Compound interest of quality

=== tt_intro ===
# CLEAR
# lang_section: tt_arrival

    ╔═══════════════════════════════════════════╗
    ║ {show_emoji: ⏳} {t("מסע בזמן", "TIME TRAVEL")}                    ║
    ║                                           ║
    ║ {t("חזרה ל-2016. הפעם — עם אג'ייל.", "Back to 2016. This time — with Agile.")}  ║
    ╚═══════════════════════════════════════════╝

~ sprint_number = 0
~ velocity = 0
~ team_buy_in = 0
~ reputation = 50
~ rtl_users_gained = 0
~ has_tests = false
~ bugs_found = 0
~ bugs_fixed = 0
~ workarounds = 0
~ years_passed = 0

{t("אתה נוחת ב-2016. Inky בדיוק נבנה.", "You land in 2016. Inky was just built.")}
{t("יש לך ידע מהעתיד. 8 שנים של כישלון.", "You carry knowledge from the future. 8 years of failure.")}
{t("אתה הולך לשכנע צוות קטן ומבריק לעבוד אחרת.", "You're going to convince a small, brilliant team to work differently.")}

* [{show_emoji: 🗣️} {t("אני צריך לדבר איתכם על תהליך.", "I need to talk to you about process.")}] -> tt_pitch

=== tt_pitch ===
# lang_section: pitch_skeptic
{show_emoji: 😒} {t("הצוות מביט בך בספק.", "The team looks at you with skepticism.")}

{t("'תהליך? אנחנו שלושה אנשים. אנחנו לא צריכים תהליך.'", "'Process? We're three people. We don't need process.'")}
{t("'בנינו 80 Days בלי סקראם. בנינו Sorcery בלי ספרינטים.'", "'We built 80 Days without Scrum. Built Sorcery without sprints.'")}
{t("'אנחנו יוצרים, לא מנהלים.'", "'We're creators, not managers.'")}

* [{show_emoji: 🤝} {t("אתם צודקים. אבל בואו ננסה ניסוי.", "You're right. But let's try an experiment.")}] -> tt_experiment
* [{show_emoji: 💣} {t("בעוד 8 שנים תהיה לכם בעיה.", "In 8 years you'll have a problem.")}] -> tt_bomb

=== tt_bomb ===
# lang_section: pitch_bomb
{show_emoji: 🤨} {t("'8 שנים? מדבר על מה?'", "'8 years? What are you talking about?'")}

{t("'RTL. עברית, ערבית, פרסית. 1.8 מיליארד אנשים.'", "'RTL. Hebrew, Arabic, Persian. 1.8 billion people.'")}
{t("'כל אחד מהם שיפתח את Inky יראה חצים הפוכים ונקודות נודדות.'", "'Every one who opens Inky will see reversed arrows and wandering periods.'")}
{t("'והם לא ידווחו באג. הם פשוט ילכו.'", "'And they won't file a bug. They'll just leave.'")}

{show_emoji: 😐} {t("שתיקה בחדר.", "Silence in the room.")}

{t("'ולמה לא נתקן את זה אז?'", "'So why won't we just fix it then?'")}
{t("'כי לא תדעו שזה שבור. כי אין לכם בדיקות.'", "'Because you won't know it's broken. Because you have no tests.'")}

~ team_buy_in += 1
-> tt_experiment

=== tt_experiment ===
{t("'הנה ההצעה: ספרינט אחד. שבועיים. עם TDD.'", "'Here's the deal: one sprint. Two weeks. With TDD.'")}
{t("'אם אחרי שבועיים אתם מרגישים שזו בזבוז — נעזוב.'", "'If after two weeks you feel it's a waste — we stop.'")}
{t("'אם זה עובד — נמשיך.'", "'If it works — we continue.'")}

* [{show_emoji: 👍} {t("'בסדר, ספרינט אחד.'", "'Fine, one sprint.'")}]
    ~ team_buy_in += 1
    {show_emoji: 🤝} {t("הם מסכימים. בחוסר רצון, אבל מסכימים.", "They agree. Reluctantly, but they agree.")}
    -> tt_sprint0

=== tt_sprint0 ===
# lang_section: sprint0_setup
# CLEAR

    {show_emoji: 🏗️} ══ SPRINT 0 — {t("הכנה", "SETUP")} ══

{t("ספרינט 0 הוא לא ספרינט אמיתי. הוא הכנה.", "Sprint 0 isn't a real sprint. It's preparation.")}
{t("לפני שרצים, צריך לדעת לאן.", "Before you run, you need to know where.")}

{show_emoji: 📋} {t("שלב 1: Product Backlog — רשימת מוצר", "Step 1: Product Backlog")}

{t("הבאקלוג הוא לא רשימת משימות. הוא רשימת ערכים.", "The backlog isn't a task list. It's a value list.")}
{t("כל פריט עונה על: 'מי מרוויח מזה ולמה?'", "Each item answers: 'who benefits and why?'")}

{t("כותבים User Stories:", "Writing User Stories:")}

  {show_emoji: 📝} US-001: {t("בתור כותב עברי, אני רוצה לראות את הדייוורט בכיוון הנכון, כדי שהתחביר לא יבלבל אותי.", "As a Hebrew writer, I want the divert arrow to point the right way, so syntax doesn't confuse me.")}

  {show_emoji: 📝} US-002: {t("בתור כותב ערבי, אני רוצה שהנקודה תהיה בקצה השמאלי, כדי שהפיסוק ייראה טבעי.", "As an Arabic writer, I want periods at the left edge, so punctuation looks natural.")}

  {show_emoji: 📝} US-003: {t("בתור מפתח, אני רוצה שבדיקות ירוצו אוטומטית, כדי שלא אשבור דברים בטעות.", "As a developer, I want tests to run automatically, so I don't break things by accident.")}

* [{show_emoji: 🤔} {t("זה נשמע כמו בירוקרטיה.", "Sounds like bureaucracy.")}] -> tt_bureaucracy
* [{show_emoji: ✅} {t("הגיוני. מה עוד?", "Makes sense. What else?")}] -> tt_dod

=== tt_bureaucracy ===
# lang_section: user_stories_pushback
{show_emoji: 😤} {t("'User Stories? אנחנו יודעים מה לבנות.'", "'User Stories? We know what to build.'")}

{t("צודק. אתה יודע מה לבנות. באנגלית.", "Right. You know what to build. In English.")}
{t("ה-User Story של הכותב העברי לא הייתה במוח שלך ב-2016.", "The Hebrew writer's story wasn't in your head in 2016.")}
{t("לא כי אתה אדם רע. כי אתה כותב באנגלית.", "Not because you're bad. Because you write in English.")}

{show_emoji: 💡} {t("User Stories מכריחות אותך לחשוב מנקודת מבט של מישהו אחר.", "User Stories force you to think from someone else's perspective.")}
{t("זה לא בירוקרטיה. זו אמפתיה עם תחביר.", "That's not bureaucracy. It's empathy with syntax.")}

~ team_buy_in += 1
-> tt_dod

=== tt_dod ===
# lang_section: definition_of_done
{show_emoji: 📋} {t("שלב 2: Definition of Done — הגדרת 'גמור'", "Step 2: Definition of Done")}

{t("מתי משהו 'גמור'? כשזה עובד? כשזה מהודר?", "When is something 'done'? When it works? When it compiles?")}
{t("הגדרת 'גמור' של הצוות:", "The team's Definition of Done:")}

  {show_emoji: ✅} {t("1. כל הבדיקות עוברות (ירוק)", "1. All tests pass (green)")}
  {show_emoji: ✅} {t("2. בדיקה חדשה לכל פיצ'ר חדש", "2. New test for every new feature")}
  {show_emoji: ✅} {t("3. עובד בעברית ובאנגלית", "3. Works in Hebrew AND English")}
  {show_emoji: ✅} {t("4. CI עובר", "4. CI passes")}

{show_emoji: 😒} {t("'מספר 3 נשמע מוגזם. למה עברית ספציפית?'", "'Number 3 seems excessive. Why Hebrew specifically?'")}

{t("'כי אם זה עובד בעברית, זה עובד בכל RTL. ואם לא בדקנו — לא נדע שזה שבור.'", "'If it works in Hebrew, it works in all RTL. If we didn't test — we won't know it's broken.'")}

* [{show_emoji: ➡️} {t("הלאה", "Next")}] -> tt_ci

=== tt_ci ===
# lang_section: continuous_integration
{show_emoji: 🔧} {t("שלב 3: CI — אינטגרציה רציפה", "Step 3: CI — Continuous Integration")}

{t("CI זה לא קסם. זה סקריפט שרץ אחרי כל קומיט.", "CI isn't magic. It's a script that runs after every commit.")}

  npm test

{t("זה הכל. שורה אחת. רצה כל בדיקה שכתבתם.", "That's it. One line. Runs every test you've written.")}
{t("אם משהו נשבר, תדעו תוך 30 שניות.", "If something breaks, you'll know in 30 seconds.")}

{show_emoji: 😏} {t("'זה ספרינט 0? הכנות, רשימות, הגדרות? מתי נכתוב קוד?'", "'Sprint 0? Lists, definitions, setup? When do we code?'")}

{t("עכשיו.", "Now.")}

-> tt_planning

=== tt_planning ===
# lang_section: sprint_planning
# CLEAR

    {show_emoji: 📅} ══ SPRINT 1 — {t("תכנון", "PLANNING")} ══

{t("Sprint Planning — ישיבת תכנון הספרינט.", "Sprint Planning — the sprint planning meeting.")}
~ sprint_number = 1

{t("הצוות יושב 30 דקות. לא יותר.", "Team sits for 30 minutes. Not more.")}
{t("שואלים: מה הערך הכי חשוב שנוכל לספק בשבועיים?", "Ask: what's the most valuable thing we can deliver in two weeks?")}

{show_emoji: 🗳️} {t("הצוות מצביע:", "Team votes:")}

* [{show_emoji: 🌍} {t("US-001: תיקון RTL — בדיקה + קוד", "US-001: Fix RTL — test + code")}]
    ~ team_buy_in += 1
    {t("בחרתם להתחיל מהבעיה שתשפיע על הכי הרבה אנשים.", "You chose the issue affecting the most people.")}
    {show_emoji: 💡} {t("זה הרעיון: הצוות בוחר, לא המנהל.", "That's the idea: team chooses, not the manager.")}
    -> tt_standup_intro

=== tt_standup_intro ===
# lang_section: daily_standup
# CLEAR

    {show_emoji: ☀️} ══ {t("סטנדאפ יומי", "DAILY STANDUP")} ══

{t("כל בוקר. 15 דקות. עומדים.", "Every morning. 15 minutes. Standing up.")}
{t("לא ישיבת סטטוס. סנכרון בין חברי צוות.", "Not a status meeting. Team sync.")}

{t("כל אחד עונה על שלוש שאלות:", "Everyone answers three questions:")}
  {show_emoji: 1️⃣} {t("מה עשיתי אתמול?", "What did I do yesterday?")}
  {show_emoji: 2️⃣} {t("מה אני עושה היום?", "What am I doing today?")}
  {show_emoji: 3️⃣} {t("מה חוסם אותי?", "What's blocking me?")}

{show_emoji: 🧑‍💻} {t("מפתח א': 'אתמול חקרתי Unicode Bidi. היום — הבדיקה הראשונה. אין חסימות.'", "Dev A: 'Yesterday researched Unicode Bidi. Today — first test. No blockers.'")}

{show_emoji: 🧑‍💻} {t("מפתח ב': 'עבדתי על פלאגינים. חוסם: אני צריך לדעת אם bidi ישפיע על ה-API.'", "Dev B: 'Worked on plugins. Blocker: need to know if bidi affects the API.'")}

{show_emoji: 😤} {t("'15 דקות כל יום? זה 5 שעות בחודש של דיבורים מיותרים!'", "'15 min every day? That's 5 hours/month of useless talk!'")}

* [{show_emoji: 🤷} {t("מרגיש מיותר.", "Feels useless.")}] -> tt_standup_waste
* [{show_emoji: 💡} {t("ה-blocker הזה שווה שבוע.", "That blocker is worth a week.")}] -> tt_standup_value

=== tt_standup_waste ===
# lang_section: standup_waste_argument
{t("כן. ב-80% מהימים, הסטנדאפ מרגיש מיותר.", "Yes. 80% of days, standup feels useless.")}
{t("כי ב-80% מהימים, אין בעיה.", "Because 80% of days, there's no problem.")}

{t("אבל ב-20% — מישהו תקוע ולא אומר.", "But 20% — someone is stuck and not saying.")}
{t("או שניים עובדים על אותו דבר.", "Or two people work on the same thing.")}
{t("או שמישהו גילה משהו שמשנה הכל.", "Or someone discovered something that changes everything.")}

{show_emoji: 💰} {t("5 שעות של 'מיותר' חוסכות 50 שעות של עבודה כפולה.", "5 hours of 'useless' saves 50 hours of duplicate work.")}

~ team_buy_in += 1
-> tt_tdd_red

=== tt_standup_value ===
# lang_section: standup_value_argument
{show_emoji: 💡} {t("בדיוק!", "Exactly!")}
{t("מפתח ב' היה עובד שבוע על API שמתעלם מ-bidi.", "Dev B would have spent a week on an API ignoring bidi.")}
{t("שאלה אחת בסטנדאפ חסכה שבוע.", "One standup question saved a week.")}

~ team_buy_in += 1
-> tt_tdd_red

=== tt_tdd_red ===
# lang_section: tdd_red_phase
# CLEAR

    {show_emoji: 🔴} ══ TDD: RED — {t("בדיקה שנכשלת", "FAILING TEST")} ══

{t("TDD = שלושה צעדים. הראשון הכי קשה:", "TDD = three steps. First is the hardest:")}
{t("כתוב בדיקה לפיצ'ר שעדיין לא קיים.", "Write a test for a feature that doesn't exist yet.")}

{show_emoji: ⌨️} {t("מפתח א' כותב:", "Dev A writes:")}

  // test/bidi.test.js
  assert( baseDirection("שלום") === "rtl" )
  assert( baseDirection("hello") === "ltr" )
  assert( baseDirection("שלום hello") === "rtl" )

{show_emoji: 🔴} npm test:

  ❌ ReferenceError: baseDirection is not defined

{show_emoji: 😤} {t("'כתבנו בדיקה שברור שתיכשל. בזבוז זמן.'", "'We wrote a test that obviously fails. Waste of time.'")}

* [{show_emoji: 🤔} {t("למה לכתוב משהו שנכשל?", "Why write something that fails?")}] -> tt_why_red
* [{show_emoji: ➡️} {t("תתקדם", "Move on")}] -> tt_tdd_green

=== tt_why_red ===
# lang_section: tdd_why_fail_first
{t("כי כישלון הוא מפת דרכים.", "Because failure is a roadmap.")}

{t("הבדיקה הנכשלת אומרת:", "The failing test says:")}
  {show_emoji: 1️⃣} {t("צריך פונקציה: baseDirection", "Need a function: baseDirection")}
  {show_emoji: 2️⃣} {t("מקבלת מחרוזת", "Takes a string")}
  {show_emoji: 3️⃣} {t("מחזירה 'rtl' או 'ltr'", "Returns 'rtl' or 'ltr'")}
  {show_emoji: 4️⃣} {t("מזהה כתב עברי", "Detects Hebrew script")}

{t("לפני שורת קוד אחת, יש לנו:", "Before one line of code, we have:")}
{t("— חוזה. — מפרט. — מדד הצלחה.", "— Contract. — Spec. — Success metric.")}

{show_emoji: 💡} {t("בדיקה נכשלת אינה בזבוז. היא עיצוב.", "A failing test isn't waste. It's design.")}

~ team_buy_in += 1
-> tt_tdd_green

=== tt_tdd_green ===
# lang_section: tdd_green_phase
# CLEAR

    {show_emoji: 🟢} ══ TDD: GREEN — {t("גרום לה לעבור", "MAKE IT PASS")} ══

{t("עכשיו — ורק עכשיו — כותבים קוד.", "Now — only now — write code.")}
{t("הכלל: הקוד הכי פשוט שגורם לבדיקה לעבור.", "Rule: simplest code that makes the test pass.")}

{show_emoji: ⌨️} {t("מפתח א' כותב:", "Dev A writes:")}

  function baseDirection(text) \{
      for (const ch of text) \{
          const cp = ch.codePointAt(0)
          if (cp >= 0x0590 && cp <= 0x05FF) return "rtl"
          if (cp >= 0xFB1D && cp <= 0xFB4F) return "rtl"
          if (cp >= 0x0600 && cp <= 0x06FF) return "rtl"
          if (cp >= 0x0041 && cp <= 0x007A) return "ltr"
      \}
      <>return "ltr"
  \}

{show_emoji: 🟢} npm test:

  ✅ baseDirection("שלום") === "rtl"
  ✅ baseDirection("hello") === "ltr"
  ✅ baseDirection("שלום hello") === "rtl"

{show_emoji: 🎉} {t("ירוק. 12 שורות.", "Green. 12 lines.")}

* [{show_emoji: 🤷} {t("כמעט אותו דבר גם בלי TDD.", "Almost same without TDD.")}] -> tt_almost_same
* [{show_emoji: ➡️} {t("מה עכשיו?", "What now?")}] -> tt_tdd_refactor

=== tt_almost_same ===
# lang_section: tdd_same_code_argument
{t("כמעט. שני הבדלים:", "Almost. Two differences:")}

{show_emoji: 1️⃣} {t("יש הוכחה שזה עובד. לא רק תחושה.", "Proof it works. Not just a feeling.")}
{show_emoji: 2️⃣} {t("ההוכחה רצה אוטומטית. לנצח. אם מישהו ישבור — הבדיקה תצעק.", "Proof runs automatically. Forever. Break it — the test screams.")}

{t("בלי TDD: כותבים קוד, בודקים ידנית פעם, שוכחים.", "Without TDD: write, test manually once, forget.")}
{t("עם TDD: הבדיקה זוכרת בשבילך.", "With TDD: the test remembers for you.")}

-> tt_tdd_refactor

=== tt_tdd_refactor ===
# lang_section: tdd_refactor_phase
# CLEAR

    {show_emoji: 🔵} ══ TDD: REFACTOR — {t("נקה", "CLEAN UP")} ══

{t("שלב 3: שפר את הקוד. הבדיקה מגינה עליך.", "Step 3: improve code. The test protects you.")}

{show_emoji: ⌨️} {t("מפתח א' מרחיב:", "Dev A expands:")}
{t("— כל טווחי RTL (סורית, תאנה, נקו, שומרונית, מנדאית)", "— All RTL ranges (Syriac, Thaana, NKo, Samaritan, Mandaic)")}
{t("— bidify() — עוטף ריצות ב-LRI/RLI/PDI", "— bidify() — wraps runs in LRI/RLI/PDI")}
{t("— stripBidi() — מסיר סימנים לפני הידור", "— stripBidi() — strips markers before compilation")}

{show_emoji: 🟢} npm test:

  ✅ 17/17 assertions pass
  {t("ירוק. 40 שורות. 10 כתבים.", "Green. 40 lines. 10 scripts.")}

{show_emoji: 💡} {t("'אדום → ירוק → שיפור' לקח שעתיים.", "'Red → Green → Refactor' took two hours.")}
{t("ה-x2 שכולם מפחדים ממנו? x2 על שעתיים = 4 שעות.", "The x2 everyone fears? x2 on two hours = 4 hours.")}
{t("4 שעות שחוסכות 8 שנים.", "4 hours that save 8 years.")}

~ has_tests = true
~ bugs_found += 1
~ bugs_fixed += 1
~ velocity += 5

* [{show_emoji: ➡️} {t("הלאה", "Next")}] -> tt_review

=== tt_review ===
# lang_section: sprint_review
# CLEAR

    {show_emoji: 🎬} ══ SPRINT REVIEW — {t("הצגה", "DEMO")} ══

{t("סוף ספרינט 1. הצוות מציג.", "End of Sprint 1. Team demos.")}
{t("Review הוא לא מצגת. זו הדגמה חיה.", "Review isn't slides. It's a live demo.")}

{show_emoji: 🖥️} {t("מפתח א' פותח Inky. כותב:", "Dev A opens Inky. Types:")}

  הבחירה → next_knot

{show_emoji: ✅} {t("החץ ימינה. הנקודה שמאלה. הסוגריים במקום.", "Arrow right. Period left. Brackets in place.")}

{t("מראה בדיקות:", "Shows tests:")}

  npm test — 17/17 ✅

{show_emoji: 🤩} {t("מפתח ב': 'רגע. גם בערבית?'", "Dev B: 'Wait. Arabic too?'")}
{t("מפתח א': 'ב-10 כתבים.'", "Dev A: 'In 10 scripts.'")}

~ reputation += 10
~ rtl_users_gained += 100

{show_emoji: 💡} {t("ה-Review שינה משהו. הצוות ראה ערך. לא בתיאוריה. על המסך.", "Review changed something. Team saw value. Not theory. On screen.")}

* [{show_emoji: ➡️} {t("מה אחרי?", "What next?")}] -> tt_retro

=== tt_retro ===
# lang_section: retrospective
# CLEAR

    {show_emoji: 🪞} ══ RETROSPECTIVE — {t("רטרוספקטיבה", "LOOKING BACK")} ══

{t("הטקס האחרון. והכי חשוב.", "Last ceremony. And the most important.")}
{t("שלוש שאלות:", "Three questions:")}

  {show_emoji: 😊} {t("מה הלך טוב?", "What went well?")}
  {show_emoji: 😐} {t("מה לא הלך טוב?", "What didn't?")}
  {show_emoji: 🔧} {t("מה נשנה?", "What to change?")}

{show_emoji: 😊} {t("טוב:", "Good:")}
{t("'הבדיקות נתנו ביטחון. שיפרתי קוד בלי פחד.'", "'Tests gave confidence. Refactored without fear.'")}
{t("'ה-User Story הכריחה אותי לחשוב אחרת.'", "'User Story forced me to think differently.'")}

{show_emoji: 😐} {t("לא טוב:", "Not good:")}
{t("'הסטנדאפ ביום שלישי הרגיש ארוך.'", "'Standup on Tuesday felt long.'")}
{t("'כתיבת בדיקות לפני קוד מרגישה לא טבעית.'", "'Tests before code feels unnatural.'")}

{show_emoji: 🔧} {t("נשנה:", "Will change:")}
{t("'סטנדאפ ל-10 דקות. בדיקות בזוגות.'", "'Standup to 10 min. Pair on tests.'")}

{show_emoji: 💡} {t("הרטרו משפרת את כל שאר הטקסים.", "Retro improves all other ceremonies.")}
{t("בלעדיה — דוגמא. איתה — התהליך שלכם.", "Without it — dogma. With it — your process.")}

~ team_buy_in += 2

* [{show_emoji: 😤} {t("וכל זה באמת שווה x2?", "Is all this worth x2?")}] -> tt_x2_math

=== tt_x2_math ===
# lang_section: x2_cost_math
# CLEAR

    {show_emoji: 🧮} ══ {t("המתמטיקה של x2", "THE MATH OF x2")} ══

{t("בואו נחשב.", "Let's calculate.")}

{show_emoji: ⏱️} {t("ספרינט 1 — עלויות 'בזבוז':", "Sprint 1 — 'waste' costs:")}
  Sprint 0 ({t("הכנה", "setup")}): ~2h
  Planning: 0.5h
  Standups: 10 × 15min = 2.5h
  {t("כתיבת בדיקות", "Writing tests")}: ~3h
  Review: 0.5h
  Retro: 0.5h
  ─────────────────
  {t("סה\"כ", "Total")}: ~9h

{show_emoji: 😤} {t("'9 שעות! יום שלם על ישיבות ובדיקות!'", "'9 hours! Full day on meetings and tests!'")}

{t("עכשיו האלטרנטיבה:", "Now the alternative:")}

{show_emoji: 📊} {t("בלי אג'ייל, 2017–2024:", "Without Agile, 2017–2024:")}
  \#122: 8 {t("שנים פתוח", "years open")}
  {t("הערות באג:", "Bug comments:")} ~15h
  {t("חקירות שגויות:", "Wrong investigations:")} ~40h
  {t("משתמשי RTL שאבדו:", "Lost RTL users:")} ∞
  {t("מוניטין:", "Reputation:")} {t("'לא תומך RTL'", "'No RTL support'")}
  ─────────────────
  {t("סה\"כ:", "Total:")} 55+ h + {t("אובדן משתמשים", "lost users")}

{show_emoji: 💡} {t("9 שעות 'בזבוז' מול 55+ שעות כאב.", "9 hours 'waste' vs 55+ hours pain.")}
{t("x2 על דבר קטן חוסך x10 על דבר גדול.", "x2 on small saves x10 on big.")}

* [{show_emoji: ➡️} {t("ומוניטין?", "And reputation?")}] -> tt_reputation

=== tt_reputation ===
# lang_section: reputation_compound
# CLEAR

    {show_emoji: 🏆} ══ {t("מוניטין", "REPUTATION")} ══

{t("ספרינט 1 נגמר. RTL עובד. מה קורה בעולם:", "Sprint 1 done. RTL works. What happens:")}

{show_emoji: 📅} {t("שבוע 3:", "Week 3:")}
{t("כותב מצרי פותח Inky. עובד. בלוג: 'Inky תומך RTL!'", "Egyptian writer opens Inky. Works. Blog: 'Inky supports RTL!'")}
~ reputation += 15
~ rtl_users_gained += 500

{show_emoji: 📅} {t("חודש 2:", "Month 2:")}
{t("מורה באיראן מלמדת Ink. 5 פרויקטים בפרסית ב-itch.io.", "Iranian teacher teaches Ink. 5 Farsi projects on itch.io.")}
~ reputation += 20
~ rtl_users_gained += 2000

{show_emoji: 📅} {t("חודש 6:", "Month 6:")}
{t("מפתח בתל אביב פותח Inky. כותב סיפור על USB. לא סוגר.", "Dev in Tel Aviv opens Inky. Writes a USB story. Doesn't close.")}
{t("כותב 600 שירים.", "Writes 600 poems.")}
~ reputation += 25
~ rtl_users_gained += 1

{show_emoji: 💡} {t("מוניטין הוא ריבית דריבית.", "Reputation is compound interest.")}
{t("משתמש מרוצה מביא שניים. מתוסכל מרתיע עשרה.", "Happy user brings two. Frustrated repels ten.")}
{t("TDD מול לא-TDD זו לא בחירה טכנית. זו בחירה עסקית.", "TDD vs no-TDD isn't technical. It's a business choice.")}

* [{show_emoji: ➡️} {t("שנה אחרי?", "Year later?")}] -> tt_year_later

=== tt_year_later ===
# lang_section: alternate_2017
# CLEAR

    {show_emoji: 📅} ══ {t("2017 — ציר זמן חלופי", "2017 — ALTERNATE TIMELINE")} ══

~ sprint_number = 26
~ velocity = 12

{t("26 ספרינטים. כל שבועיים.", "26 sprints. Every two weeks.")}

  {t("בדיקות:", "Tests:")} 247
  {t("באגים שנתפסו ב-CI:", "Bugs caught by CI:")} 34
  {t("באגים שהגיעו למשתמשים:", "Bugs reaching users:")} 2
  Velocity: {velocity} pts/sprint
  {t("סיפורי RTL ב-itch.io:", "RTL stories on itch.io:")} 47

{show_emoji: 📅} {t("בציר המקורי — השנה:", "Original timeline — this year:")}
  {t("issue \#122 נפתח. 'בינתיים, VS Code.'", "\#122 opens. 'For now, use VS Code.'")}

{show_emoji: 🌍} {t("בציר הזה:", "This timeline:")}
  {t("אין \#122. נתפס בספרינט 1. תוקן בשעתיים.", "No \#122. Caught Sprint 1. Fixed in 2 hours.")}

{show_emoji: 💡} {t("ה-x2 הפך ל-x0.1.", "The x2 became x0.1.")}
{t("ערך מצטבר. כאב מצטבר. ההפרש מעריכי.", "Value compounds. Pain compounds. The gap is exponential.")}

* [{show_emoji: 📝} {t("הסיכום?", "Summary?")}] -> tt_final

=== tt_final ===
# lang_section: two_timelines
# CLEAR

    ╔═══════════════════════════════════════════════╗
    ║ {show_emoji: ⏳} {t("שני צירי זמן", "TWO TIMELINES")}                     ║
    ╚═══════════════════════════════════════════════╝

{show_emoji: 🚫} {t("ציר מקורי — בלי אג'ייל:", "Original — no Agile:")}
  {t("באג נמצא:", "Bug found:")} 2017
  {t("באג תוקן:", "Bug fixed:")} ???? ({t("עדיין פתוח", "still open")})
  {t("עקיפות:", "Workarounds:")} ∞
  {t("מוניטין:", "Rep:")} {t("'לא תומך RTL'", "'No RTL'")}

{show_emoji: ✅} {t("ציר חלופי — אג'ייל + TDD:", "Alternate — Agile + TDD:")}
  {t("באג נמצא:", "Bug found:")} 2016, Sprint 1
  {t("באג תוקן:", "Bug fixed:")} 2016, Sprint 1
  {t("עקיפות:", "Workarounds:")} 0
  {t("משתמשי RTL:", "RTL users:")} {rtl_users_gained}+
  {t("מוניטין:", "Rep:")} {reputation}/100

{show_emoji: ⏱️} {t("העלות:", "The cost:")}
  {t("9 שעות 'ישיבות מיותרות'. x2 על בדיקות.", "9 hours 'useless meetings'. x2 on tests.")}
  {t("רטרוספקטיבות שמרגישות כמו 'סתם לדבר'.", "Retros that feel like 'just talking'.")}

{show_emoji: 💎} {t("הרווח:", "Payoff:")}
  {t("בדיקה שומעת שתיקה.", "A test hears silence.")}
  {t("סטנדאפ שומע חסימות.", "Standup hears blockers.")}
  {t("רטרו שומעת כאב.", "Retro hears pain.")}
  {t("User Story שומעת משתמשים.", "User Story hears users.")}
  {t("ספרינט שומע ערך.", "Sprint hears value.")}

{t("אג'ייל זה לא תהליך. זו תרבות של הקשבה.", "Agile isn't a process. It's a culture of listening.")}

{show_emoji: ❤️} {t("הקשבה מתחילה בבדיקה אחת:", "Listening starts with one test:")}

  assert( baseDirection("שלום") === "rtl" )

{show_emoji: 👂} {t("בדיקה שומעת שתיקה.", "A test hears silence.")}

* [{show_emoji: 🏠} {t("תפריט", "Menu")}] -> start
* [{show_emoji: 🔚} {t("סיים", "End")}] -> END

