# MusicXML-IO Roundtrip Issues Report

This document summarizes the issues found during roundtrip testing (parse → serialize → reparse) of MusicXML files.

## Test Files Used
- Brahms: BrahWiMeSample.musicxml, various LilyPond test files
- Complex orchestral: ActorPreludeSample.musicxml
- Vocal with lyrics: Dichterliebe01.musicxml, DebuMandSample.musicxml
- LilyPond test suite: 31a-Directions.xml, 32a-Notations.xml, 33a-Spanners.xml, etc.

## Issues Found

### 1. XML Comments Lost (All Files)
**Severity: Low**
**Impact: Layout/readability only**

All XML comments (`<!-- ... -->`) are lost during roundtrip. These are typically section separators added by notation software for readability and have no musical impact.

Example:
```xml
<!-- Original -->
<!--=========================================================-->
<measure number="1" width="340">

<!-- After roundtrip -->
<measure number="1" id="i5EV0vqro8G" width="340">
```

### 2. XML Declaration Changes
**Severity: Low**
**Impact: Compatibility only**

The `standalone="no"` attribute is removed from the XML declaration, and `encoding` is normalized to `UTF-8`.

```xml
<!-- Original -->
<?xml version="1.0" encoding="UTF-8" standalone="no"?>

<!-- After roundtrip -->
<?xml version="1.0" encoding="UTF-8"?>
```

### 3. DOCTYPE Version Normalization
**Severity: Low**
**Impact: Validation only**

The DOCTYPE declaration is always normalized to MusicXML 4.0, regardless of the original version.

```xml
<!-- Original (may vary) -->
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 0.6 Partwise//EN" ...>

<!-- After roundtrip -->
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ...>
```

### 4. `other-dynamics` Not Preserved in Direction Types (BUG)
**Severity: Medium**
**Impact: Data loss**

Location: `src/importers/musicxml.ts:parseDirectionTypes()` (lines 1784-1805)

The `<other-dynamics>` element within direction-type is not parsed. Only standard dynamics values are processed.

```xml
<!-- Original - this is lost -->
<direction>
  <direction-type>
    <dynamics><other-dynamics>abc-ffz</other-dynamics></dynamics>
  </direction-type>
</direction>

<!-- After roundtrip - direction is missing -->
```

**Fix Required:** Add `other-dynamics` handling in `parseDirectionTypes()` function.

### 5. Attribute Order Changes (Non-issue)
**Severity: None**
**Impact: Text diff only**

XML attribute order is different between original and roundtrip, but this is semantically equivalent per XML specification.

```xml
<!-- Original -->
<slur bezier-x="16" bezier-y="10" default-x="7" default-y="3" number="1" placement="above" type="start"/>

<!-- After roundtrip (same attributes, different order) -->
<slur number="1" type="start" default-x="7" default-y="3" bezier-x="16" bezier-y="10" placement="above"/>
```

### 6. ID Attributes Added (Design Decision)
**Severity: None**
**Impact: Larger file size**

Internal `id` attributes are added to various elements (measures, notes, directions, etc.) for programmatic reference. This is intentional behavior.

## Well-Preserved Elements

The following elements are correctly preserved during roundtrip:

| Category | Status |
|----------|--------|
| Notes (pitch, duration, type) | ✅ Preserved |
| Rests | ✅ Preserved |
| Ties and Tied notations | ✅ Preserved |
| Slurs (including bezier curves) | ✅ Preserved |
| Articulations | ✅ Preserved |
| Ornaments | ✅ Preserved |
| Dynamics (standard values) | ✅ Preserved |
| Wedges (crescendo/diminuendo) | ✅ Preserved |
| Fermatas | ✅ Preserved |
| Grace notes | ✅ Preserved |
| Beams | ✅ Preserved |
| Stems | ✅ Preserved |
| Accidentals | ✅ Preserved |
| Lyrics | ✅ Preserved |
| Credits | ✅ Preserved |
| Defaults (page layout, fonts) | ✅ Preserved |
| Part groups | ✅ Preserved |
| Barlines and repeats | ✅ Preserved |
| Tuplets | ✅ Preserved |
| Print elements | ✅ Preserved |
| Forward/Backup | ✅ Preserved |
| Harmonies | ✅ Preserved |
| Glissando/Slide | ✅ Preserved |
| Technical notations | ✅ Preserved |

## Recommendations

1. **Fix `other-dynamics`**: Add parsing support for `<other-dynamics>` in direction types
2. **Consider preserving comments**: Store comments in parsed structure for perfect roundtrip
3. **Add standalone option**: Allow preserving `standalone="no"` in XML declaration
4. **Version preservation**: Consider an option to preserve original MusicXML version

## Test Coverage

Roundtrip tests pass for all 150 fixture files, validating structural integrity of:
- Part structure
- Measure counts
- Entry counts and types
- Note properties (pitch, duration, voice, staff)
- Key signatures
- Time signatures
- Backup/Forward entries
