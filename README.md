# musicxml-io

A TypeScript library for parsing, manipulating, and serializing MusicXML with a cleaner data model.

## Roundtrip Coverage Testing

We measure implementation completeness by comparing original MusicXML files with their roundtrip output (parse → internal representation → serialize).

### Running Coverage Tests

```bash
# Get overall coverage score
npm run coverage:roundtrip

# Compare a specific file (string diff)
npm run diff:roundtrip -- path/to/file.xml
```

### Current Score: 83.8%

| Metric | Score |
|--------|------:|
| Overall | 83.8% |
| Node coverage | 85.5% |
| Attribute coverage | 73.4% |
| Text value coverage | 87.3% |

### How Scoring Works

The coverage script (`scripts/measure-coverage.ts`) performs deep XML comparison:

1. **Parse both XMLs** - Original and roundtrip output are parsed into structured objects
2. **Compare nodes** - Elements are matched by signature (tag name + attributes + text), order-independent
3. **Compare attributes** - All attributes are checked (except `version` which serializer always sets to 4.0)
4. **Compare text values** - Text content is compared (whitespace-only text is ignored)
5. **Penalty for additions** - Extra elements in roundtrip output count against the score

#### What's Ignored (by design)
- `<?xml ?>` declaration - Serializer generates this
- `<!DOCTYPE>` declaration - Serializer generates this
- `@version` attribute - Serializer always outputs `4.0`
- Whitespace-only text nodes - Formatting differences
- XML comments `<!-- -->` - Not preserved by parser

#### What's NOT in the Score (limitations)
- Attribute changes cause element mismatch (double penalty: missing + added)
- To achieve 100%, string-level comparison (`diff:roundtrip`) is also needed

### Top Missing Elements

| Element | Files Affected |
|---------|---------------:|
| `notations` | 216 |
| `identification` | 137 |
| `notehead` | 68 |
| `direction-type` | 50 |
| `harmony` | 17 |

These represent features not yet fully implemented in the parser/serializer.
