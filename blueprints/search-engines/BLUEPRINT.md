# Search Engine Blueprint (SKSearch)

## Overview & Purpose

A full-text search engine indexes, stores, and retrieves documents based on textual relevance, structured filters, and statistical scoring. Unlike traditional databases optimized for exact lookups, search engines excel at **fuzzy, ranked retrieval** — returning the most relevant results from millions of documents in milliseconds. This blueprint covers Elasticsearch/OpenSearch/Solr-class systems built on inverted index foundations.

### Why Build This?
The Elasticsearch SSPL license change (2021) and subsequent Elastic License 2.0 restrictions made the most popular search engine effectively proprietary for cloud providers. OpenSearch (AWS fork) exists but carries its own ecosystem baggage. A Forgeprint-generated search engine provides:
- **True open-source** full-text search with no licensing ambiguity
- **Modular architecture** — swap scoring algorithms, analyzers, storage backends
- **Cloud-native design** — sharding, replication, and lifecycle management built-in
- **Vector search integration** — hybrid BM25 + kNN for modern AI workloads

### Core Responsibilities
- **Inverted Index Construction**: Build and maintain term-to-document mappings for fast retrieval
- **Relevance Scoring**: Rank documents by statistical relevance using BM25/TF-IDF and custom scoring
- **Text Analysis**: Tokenize, normalize, and transform text through configurable analyzer pipelines
- **Query Processing**: Parse, optimize, and execute complex boolean/phrase/fuzzy queries
- **Aggregation Engine**: Compute faceted counts, statistics, histograms, and nested aggregations
- **Distributed Coordination**: Route queries across shards, merge results, manage cluster state
- **Index Lifecycle**: Automate hot→warm→cold→delete transitions for time-based data

---

## Core Concepts

### 1. Documents and Fields

**Documents** are the fundamental unit of indexing and search — analogous to rows in a relational database, but schema-flexible.

```json
{
  "_index": "products",
  "_id": "prod-12345",
  "_source": {
    "title": "Wireless Bluetooth Headphones",
    "description": "Premium noise-cancelling headphones with 30-hour battery life...",
    "brand": "AudioMax",
    "price": 149.99,
    "categories": ["electronics", "audio", "headphones"],
    "rating": 4.7,
    "review_count": 2847,
    "location": { "lat": 37.7749, "lon": -122.4194 },
    "created_at": "2025-11-15T10:30:00Z",
    "embedding": [0.123, -0.456, 0.789, ...]
  }
}
```

**Field Types**:

| Type | Description | Indexed | Stored | Doc Values | Use Case |
|------|-------------|---------|--------|------------|----------|
| `text` | Analyzed full-text | ✓ (inverted index) | Optional | ✗ | Search body, titles |
| `keyword` | Exact-match string | ✓ (inverted index) | Optional | ✓ | Filters, aggregations, sorting |
| `integer` / `long` | Numeric integers | ✓ (BKD tree) | Optional | ✓ | Range filters, sorting |
| `float` / `double` | Floating point | ✓ (BKD tree) | Optional | ✓ | Scores, prices |
| `date` | ISO 8601 timestamp | ✓ (BKD tree) | Optional | ✓ | Time ranges, sorting |
| `boolean` | true/false | ✓ | Optional | ✓ | Flags, filters |
| `geo_point` | lat/lon coordinate | ✓ (BKD tree) | Optional | ✓ | Distance queries |
| `geo_shape` | Complex geometry | ✓ (BKD tree) | Optional | ✗ | Polygon intersection |
| `nested` | Array of objects (independent) | ✓ | ✓ | ✓ | Structured sub-documents |
| `object` | JSON object (flattened) | ✓ | Optional | ✓ | Simple nested data |
| `dense_vector` | Fixed-dim float array | ✓ (HNSW/flat) | ✓ | ✗ | kNN vector search |
| `completion` | FST-optimized prefix | ✓ (FST) | ✗ | ✗ | Autocomplete suggestions |

### 2. Index Mappings

Mappings define the schema for an index — field names, types, and analysis settings.

#### Dynamic Mapping
Auto-detect field types from the first document:
```json
{
  "mappings": {
    "dynamic": true,
    "dynamic_templates": [
      {
        "strings_as_keywords": {
          "match_mapping_type": "string",
          "mapping": {
            "type": "keyword",
            "ignore_above": 256,
            "fields": {
              "text": { "type": "text" }
            }
          }
        }
      },
      {
        "dates": {
          "match": "*_at",
          "mapping": { "type": "date" }
        }
      }
    ]
  }
}
```

#### Explicit Mapping
```json
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "english_custom",
        "fields": {
          "raw": { "type": "keyword" },
          "autocomplete": { "type": "text", "analyzer": "edge_ngram_analyzer" }
        }
      },
      "price": { "type": "float" },
      "tags": { "type": "keyword" },
      "location": { "type": "geo_point" },
      "embedding": {
        "type": "dense_vector",
        "dims": 768,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

#### Multi-Fields
Index the same source field in multiple ways:
- `title` → analyzed with `english` analyzer for full-text search
- `title.raw` → `keyword` for exact match, sorting, aggregations
- `title.autocomplete` → `edge_ngram` analyzer for prefix suggestions

### 3. Analyzers

An analyzer is a pipeline that transforms text into indexable tokens:

```
Input Text → Char Filters → Tokenizer → Token Filters → Indexed Terms
```

#### Built-in Analyzers

| Analyzer | Tokenizer | Token Filters | Example Input → Output |
|----------|-----------|---------------|----------------------|
| `standard` | Unicode Text | lowercase | "The Quick-Brown Fox" → ["the", "quick", "brown", "fox"] |
| `simple` | Letter | lowercase | "It's a test-123" → ["it", "s", "a", "test"] |
| `whitespace` | Whitespace | (none) | "The Quick Fox" → ["The", "Quick", "Fox"] |
| `keyword` | Noop (entire input) | (none) | "New York" → ["New York"] |
| `english` | Standard | lowercase, stop, stemmer | "Running quickly" → ["run", "quick"] |
| `pattern` | Regex split | lowercase | "foo-bar_baz" → ["foo", "bar", "baz"] |

#### Custom Analyzer Definition
```json
{
  "settings": {
    "analysis": {
      "char_filter": {
        "html_cleaner": {
          "type": "html_strip",
          "escaped_tags": ["b", "i"]
        }
      },
      "tokenizer": {
        "custom_edge_ngram": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15,
          "token_chars": ["letter", "digit"]
        }
      },
      "filter": {
        "english_stemmer": { "type": "stemmer", "language": "english" },
        "english_stop": { "type": "stop", "stopwords": "_english_" },
        "synonym_filter": {
          "type": "synonym_graph",
          "synonyms_path": "analysis/synonyms.txt"
        }
      },
      "analyzer": {
        "english_custom": {
          "type": "custom",
          "char_filter": ["html_cleaner"],
          "tokenizer": "standard",
          "filter": ["lowercase", "english_stop", "english_stemmer", "synonym_filter"]
        },
        "edge_ngram_analyzer": {
          "type": "custom",
          "tokenizer": "custom_edge_ngram",
          "filter": ["lowercase"]
        }
      }
    }
  }
}
```

#### Tokenizer Types

| Tokenizer | Description | Use Case |
|-----------|-------------|----------|
| `standard` | Unicode text segmentation | General-purpose text |
| `whitespace` | Split on whitespace only | Pre-tokenized input |
| `keyword` | Entire input as single token | Exact-match fields |
| `pattern` | Split on regex pattern | Custom delimiters |
| `ngram` | Sliding window substrings | Substring matching |
| `edge_ngram` | Prefix substrings from start | Autocomplete / search-as-you-type |
| `letter` | Split on non-letter characters | Simple word extraction |
| `uax_url_email` | Standard + URL/email detection | Content with URLs/emails |
| `path_hierarchy` | Split filesystem paths | File path navigation |
| `icu_tokenizer` | ICU-based segmentation | CJK and multilingual text |

#### Token Filter Types

| Filter | Description | Example |
|--------|-------------|---------|
| `lowercase` | Convert to lowercase | "FOO" → "foo" |
| `uppercase` | Convert to uppercase | "foo" → "FOO" |
| `stemmer` | Reduce to root form | "running" → "run" |
| `stop` | Remove stop words | "the" → (removed) |
| `synonym` | Expand/contract synonyms | "laptop" → ["laptop", "notebook"] |
| `synonym_graph` | Multi-word synonym expansion | "NY" → "New York" |
| `ngram` | Generate ngram tokens | "fox" → ["fo", "ox", "fox"] |
| `shingle` | Generate word ngrams | "quick brown fox" → ["quick brown", "brown fox"] |
| `trim` | Remove surrounding whitespace | " foo " → "foo" |
| `truncate` | Limit token length | "elasticsearch" → "elastic" (length=7) |
| `unique` | Remove duplicate tokens | ["a", "b", "a"] → ["a", "b"] |
| `ascii_folding` | Convert Unicode to ASCII | "café" → "cafe" |
| `elision` | Remove leading elisions | "l'avion" → "avion" |
| `phonetic` | Phonetic encoding | "Smith" → "S530" (Soundex) |
| `word_delimiter_graph` | Split on word boundaries | "Wi-Fi" → ["Wi", "Fi", "WiFi"] |
| `icu_folding` | Unicode folding (ICU) | "ü" → "u" |
| `icu_normalizer` | Unicode normalization | NFC/NFKC normalization |

### 4. Inverted Index

The core data structure that enables fast full-text search:

```
Term Dictionary:                    Postings Lists:
┌──────────────┐                   ┌────────────────────────────┐
│ "bluetooth"  │ ──────────────→   │ DocID: 1, Freq: 2, Pos: [3,15] │
│ "headphone"  │ ──────────────→   │ DocID: 1, Freq: 1, Pos: [5]    │
│              │                   │ DocID: 7, Freq: 3, Pos: [1,8,22]│
│ "noise"      │ ──────────────→   │ DocID: 1, Freq: 1, Pos: [7]    │
│              │                   │ DocID: 3, Freq: 2, Pos: [2,19]  │
│ "wireless"   │ ──────────────→   │ DocID: 1, Freq: 1, Pos: [1]    │
│              │                   │ DocID: 5, Freq: 1, Pos: [4]     │
└──────────────┘                   └────────────────────────────┘
```

**Components**:
- **Term Dictionary**: Sorted list of unique terms (FST or trie for prefix lookup)
- **Postings List**: Per-term list of (document_id, frequency, positions)
- **Skip List**: Layered index over postings for fast intersection
- **Stored Fields**: Original document source (compressed)
- **Doc Values**: Column-oriented storage for sorting/aggregations
- **Norms**: Per-document field length normalization factors
- **Term Vectors**: Per-document term frequency/position data (optional)

### 5. Relevance Scoring

#### BM25 (Default)

The Okapi BM25 scoring function balances term frequency, document length, and inverse document frequency:

```
score(q, d) = Σ IDF(qi) × (tf(qi, d) × (k1 + 1)) / (tf(qi, d) + k1 × (1 - b + b × |d| / avgdl))

Where:
  IDF(qi) = ln(1 + (N - n(qi) + 0.5) / (n(qi) + 0.5))
  
  tf(qi, d)  = term frequency of qi in document d
  N          = total number of documents
  n(qi)      = number of documents containing qi
  |d|        = length of document d (in terms)
  avgdl      = average document length across the index
  k1         = term frequency saturation parameter (default: 1.2)
  b          = length normalization parameter (default: 0.75)
```

**Parameter Tuning**:
- `k1 = 0`: ignore term frequency (boolean model)
- `k1 → ∞`: linear term frequency (no saturation)
- `k1 = 1.2`: default; good balance for most corpora
- `b = 0`: no length normalization
- `b = 1`: full length normalization
- `b = 0.75`: default; moderate length penalty

#### TF-IDF (Classic)

```
score(q, d) = Σ tf(qi, d) × idf(qi)²

Where:
  tf(qi, d)   = √(frequency of qi in d)
  idf(qi)     = 1 + ln(N / (df(qi) + 1))
  fieldNorm   = 1 / √(fieldLength)
```

#### Function Score Query
Combine relevance with custom signals:
```json
{
  "query": {
    "function_score": {
      "query": { "match": { "title": "headphones" } },
      "functions": [
        {
          "field_value_factor": {
            "field": "rating",
            "factor": 1.2,
            "modifier": "sqrt",
            "missing": 1
          }
        },
        {
          "gauss": {
            "created_at": {
              "origin": "now",
              "scale": "30d",
              "decay": 0.5
            }
          }
        },
        {
          "script_score": {
            "script": "Math.log(2 + doc['review_count'].value)"
          }
        }
      ],
      "score_mode": "multiply",
      "boost_mode": "multiply"
    }
  }
}
```

**Decay Functions**:
- `gauss`: Gaussian decay — smooth, bell-shaped
- `exp`: Exponential decay — sharp drop-off
- `linear`: Linear decay — constant rate

### 6. Query Types

#### Term-Level Queries (Exact Match)
```json
// Term query — exact keyword match (not analyzed)
{ "term": { "status": "published" } }

// Terms query — match any of multiple values
{ "terms": { "tags": ["electronics", "audio"] } }

// Range query — numeric/date ranges
{ "range": { "price": { "gte": 50, "lte": 200 } } }

// Exists query — field existence check
{ "exists": { "field": "description" } }

// Prefix query — keyword prefix match
{ "prefix": { "brand": { "value": "Audio" } } }

// Wildcard query — pattern matching
{ "wildcard": { "title": { "value": "head*one?" } } }

// Regexp query — regular expression
{ "regexp": { "sku": "[A-Z]{3}-[0-9]{5}" } }
```

#### Full-Text Queries (Analyzed)
```json
// Match query — analyzed text search
{ "match": { "title": "wireless bluetooth headphones" } }

// Match phrase — exact phrase with optional slop
{ "match_phrase": { "description": { "query": "noise cancelling", "slop": 1 } } }

// Multi-match — search across multiple fields
{
  "multi_match": {
    "query": "wireless headphones",
    "fields": ["title^3", "description", "brand^2"],
    "type": "best_fields",
    "tie_breaker": 0.3
  }
}

// Query string — Lucene syntax
{ "query_string": { "query": "title:wireless AND price:[100 TO 200]" } }
```

**Multi-Match Types**:
- `best_fields`: Score from best-matching field (default)
- `most_fields`: Sum scores across all fields
- `cross_fields`: Treat fields as one combined field
- `phrase`: Run `match_phrase` on each field
- `phrase_prefix`: Run `match_phrase_prefix` on each field

#### Compound Queries
```json
{
  "bool": {
    "must": [
      { "match": { "title": "headphones" } }
    ],
    "should": [
      { "match": { "description": "wireless" } },
      { "term": { "brand": "AudioMax" } }
    ],
    "must_not": [
      { "range": { "price": { "gt": 500 } } }
    ],
    "filter": [
      { "term": { "in_stock": true } },
      { "range": { "rating": { "gte": 4.0 } } }
    ],
    "minimum_should_match": 1
  }
}
```

**Boolean Clauses**:
- `must`: Must match; contributes to score
- `should`: Optional match; boosts score if matched
- `must_not`: Must not match; no scoring (filter context)
- `filter`: Must match; no scoring (filter context, cacheable)

#### Fuzzy Search
```json
{
  "match": {
    "title": {
      "query": "headphnes",
      "fuzziness": "AUTO",
      "prefix_length": 2,
      "max_expansions": 50
    }
  }
}
```

**Fuzziness Levels** (AUTO):
- 0-2 characters: exact match required
- 3-5 characters: 1 edit allowed
- 6+ characters: 2 edits allowed

**Edit operations**: insertion, deletion, substitution, transposition (Damerau-Levenshtein)

#### Nested & Join Queries
```json
// Nested query — query nested objects independently
{
  "nested": {
    "path": "reviews",
    "query": {
      "bool": {
        "must": [
          { "match": { "reviews.text": "excellent quality" } },
          { "range": { "reviews.rating": { "gte": 4 } } }
        ]
      }
    },
    "inner_hits": { "size": 3 }
  }
}

// Has child query
{
  "has_child": {
    "type": "review",
    "query": { "range": { "rating": { "gte": 4.5 } } },
    "min_children": 5,
    "score_mode": "avg"
  }
}
```

### 7. Aggregations

Aggregations compute analytics over the search results:

#### Bucket Aggregations (Grouping)
```json
{
  "aggs": {
    "by_brand": {
      "terms": {
        "field": "brand",
        "size": 20,
        "order": { "_count": "desc" },
        "min_doc_count": 1
      }
    },
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 50 },
          { "from": 50, "to": 150 },
          { "from": 150, "to": 300 },
          { "from": 300 }
        ]
      }
    },
    "by_month": {
      "date_histogram": {
        "field": "created_at",
        "calendar_interval": "month",
        "min_doc_count": 0,
        "extended_bounds": {
          "min": "2025-01-01",
          "max": "2025-12-31"
        }
      }
    },
    "price_histogram": {
      "histogram": {
        "field": "price",
        "interval": 25,
        "min_doc_count": 1
      }
    }
  }
}
```

#### Metric Aggregations (Statistics)
```json
{
  "aggs": {
    "price_stats": {
      "extended_stats": { "field": "price" }
    },
    "rating_percentiles": {
      "percentiles": {
        "field": "rating",
        "percents": [25, 50, 75, 90, 95, 99]
      }
    },
    "unique_brands": {
      "cardinality": {
        "field": "brand",
        "precision_threshold": 1000
      }
    }
  }
}
```

#### Nested Aggregations
```json
{
  "aggs": {
    "by_brand": {
      "terms": { "field": "brand", "size": 10 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } },
        "avg_rating": { "avg": { "field": "rating" } },
        "top_products": {
          "top_hits": {
            "size": 3,
            "sort": [{ "rating": "desc" }],
            "_source": ["title", "price", "rating"]
          }
        }
      }
    }
  }
}
```

#### Pipeline Aggregations
```json
{
  "aggs": {
    "monthly_sales": {
      "date_histogram": {
        "field": "sold_at",
        "calendar_interval": "month"
      },
      "aggs": {
        "total_revenue": { "sum": { "field": "price" } }
      }
    },
    "revenue_derivative": {
      "derivative": { "buckets_path": "monthly_sales>total_revenue" }
    },
    "moving_avg_revenue": {
      "moving_avg": {
        "buckets_path": "monthly_sales>total_revenue",
        "window": 3,
        "model": "simple"
      }
    },
    "max_revenue_month": {
      "max_bucket": { "buckets_path": "monthly_sales>total_revenue" }
    }
  }
}
```

#### Significant Terms
```json
{
  "query": { "match": { "category": "headphones" } },
  "aggs": {
    "significant_keywords": {
      "significant_terms": {
        "field": "description.keyword",
        "size": 10,
        "min_doc_count": 5,
        "mutual_information": { "include_negatives": false }
      }
    }
  }
}
```

#### Composite Aggregation (Pagination)
```json
{
  "aggs": {
    "paginated_brands": {
      "composite": {
        "size": 100,
        "sources": [
          { "brand": { "terms": { "field": "brand" } } },
          { "category": { "terms": { "field": "category" } } }
        ],
        "after": { "brand": "Sony", "category": "audio" }
      }
    }
  }
}
```

### 8. Highlighting

Return matched text snippets with markup:

```json
{
  "query": { "match": { "description": "noise cancelling" } },
  "highlight": {
    "pre_tags": ["<em>"],
    "post_tags": ["</em>"],
    "fields": {
      "description": {
        "type": "unified",
        "fragment_size": 150,
        "number_of_fragments": 3,
        "no_match_size": 100
      }
    }
  }
}
```

**Highlighter Types**:
- `unified` (default): Best quality; uses postings, term vectors, or re-analysis
- `plain`: Simple re-analysis; works everywhere but slower
- `fvh` (Fast Vector Highlighter): Requires `term_vector: with_positions_offsets`

### 9. Suggestions & Autocomplete

#### Term Suggester (Did-you-mean)
```json
{
  "suggest": {
    "spell_check": {
      "text": "wirless headphnes",
      "term": {
        "field": "title",
        "suggest_mode": "popular",
        "min_word_length": 3,
        "max_edits": 2
      }
    }
  }
}
```

#### Phrase Suggester
```json
{
  "suggest": {
    "phrase_fix": {
      "text": "noize cancling headfones",
      "phrase": {
        "field": "title.trigram",
        "gram_size": 3,
        "direct_generator": [{
          "field": "title.trigram",
          "suggest_mode": "always"
        }],
        "collate": {
          "query": {
            "source": { "match_phrase": { "title": "{{suggestion}}" } }
          },
          "prune": true
        }
      }
    }
  }
}
```

#### Completion Suggester (Autocomplete)
```json
// Mapping
{
  "properties": {
    "suggest": {
      "type": "completion",
      "analyzer": "simple",
      "contexts": [
        { "name": "category", "type": "category" },
        { "name": "location", "type": "geo", "precision": 4 }
      ]
    }
  }
}

// Query
{
  "suggest": {
    "product_suggest": {
      "prefix": "wire",
      "completion": {
        "field": "suggest",
        "size": 5,
        "fuzzy": { "fuzziness": 1 },
        "contexts": {
          "category": ["electronics"]
        }
      }
    }
  }
}
```

### 10. Geospatial Search

#### Geo Distance Query
```json
{
  "query": {
    "bool": {
      "filter": {
        "geo_distance": {
          "distance": "10km",
          "location": { "lat": 37.7749, "lon": -122.4194 }
        }
      }
    }
  },
  "sort": [
    {
      "_geo_distance": {
        "location": { "lat": 37.7749, "lon": -122.4194 },
        "order": "asc",
        "unit": "km"
      }
    }
  ]
}
```

#### Geo Bounding Box
```json
{
  "query": {
    "geo_bounding_box": {
      "location": {
        "top_left": { "lat": 40.73, "lon": -74.1 },
        "bottom_right": { "lat": 40.01, "lon": -71.12 }
      }
    }
  }
}
```

#### Geo Shape Query
```json
{
  "query": {
    "geo_shape": {
      "coverage_area": {
        "shape": {
          "type": "polygon",
          "coordinates": [[[...], [...], [...]]]
        },
        "relation": "intersects"
      }
    }
  }
}
```

#### Geo Aggregations
```json
{
  "aggs": {
    "nearby_grid": {
      "geohash_grid": {
        "field": "location",
        "precision": 5
      }
    },
    "distance_rings": {
      "geo_distance": {
        "field": "location",
        "origin": "37.7749,-122.4194",
        "ranges": [
          { "to": 5 },
          { "from": 5, "to": 10 },
          { "from": 10, "to": 25 },
          { "from": 25 }
        ]
      }
    }
  }
}
```

### 11. Vector Search (kNN)

#### Dense Vector Configuration
```json
{
  "mappings": {
    "properties": {
      "embedding": {
        "type": "dense_vector",
        "dims": 768,
        "index": true,
        "similarity": "cosine",
        "index_options": {
          "type": "hnsw",
          "m": 16,
          "ef_construction": 200
        }
      }
    }
  }
}
```

#### Approximate kNN Search
```json
{
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, -0.34, 0.56, ...],
    "k": 10,
    "num_candidates": 100,
    "filter": {
      "term": { "category": "electronics" }
    }
  }
}
```

#### Hybrid Search (BM25 + kNN)
```json
{
  "query": {
    "match": { "title": "wireless headphones" }
  },
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, -0.34, 0.56, ...],
    "k": 10,
    "num_candidates": 100,
    "boost": 0.5
  },
  "rank": {
    "rrf": {
      "window_size": 50,
      "rank_constant": 60
    }
  }
}
```

**Reciprocal Rank Fusion (RRF)**:
```
RRF_score(d) = Σ 1 / (rank_constant + rank_i(d))
```
Combines rankings from BM25 and kNN without needing score normalization.

### 12. Index Lifecycle Management (ILM)

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "7d",
            "max_docs": 100000000
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "allocate": {
            "require": { "data": "warm" }
          },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "90d",
        "actions": {
          "allocate": {
            "require": { "data": "cold" }
          },
          "freeze": {},
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### 13. Ingest Pipelines

Transform documents on write:

```json
{
  "description": "Enrich and transform product documents",
  "processors": [
    {
      "set": {
        "field": "indexed_at",
        "value": "{{{_ingest.timestamp}}}"
      }
    },
    {
      "lowercase": { "field": "brand" }
    },
    {
      "trim": { "field": "title" }
    },
    {
      "grok": {
        "field": "sku",
        "patterns": ["%{WORD:category_code}-%{NUMBER:product_number}"]
      }
    },
    {
      "geoip": {
        "field": "client_ip",
        "target_field": "geo"
      }
    },
    {
      "inference": {
        "model_id": "sentence-transformers__all-minilm-l6-v2",
        "target_field": "embedding",
        "field_map": { "description": "text_field" }
      }
    },
    {
      "script": {
        "lang": "painless",
        "source": "ctx.title_length = ctx.title.length();"
      }
    }
  ]
}
```

### 14. Cluster & Distribution

#### Shard Architecture
```
Index "products" (5 primary shards, 1 replica)
┌─────────────────────────────────────────────────┐
│ Node 1 (Coordinator + Data)                     │
│   [P0] [R2] [R4]                                │
├─────────────────────────────────────────────────┤
│ Node 2 (Data)                                   │
│   [P1] [P3] [R0]                                │
├─────────────────────────────────────────────────┤
│ Node 3 (Data)                                   │
│   [P2] [P4] [R1] [R3]                           │
└─────────────────────────────────────────────────┘

Document Routing: shard = hash(_routing || _id) % num_primary_shards
```

#### Node Roles
- **Master**: Cluster state management, shard allocation decisions
- **Data**: Store shards, execute search/indexing operations
- **Data Hot/Warm/Cold**: Tiered data nodes for ILM
- **Coordinator**: Route requests, merge results (no local data)
- **Ingest**: Run ingest pipelines before indexing
- **ML**: Machine learning job execution
- **Transform**: Run transform jobs

#### Index Templates
```json
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index.lifecycle.name": "logs_policy",
      "index.lifecycle.rollover_alias": "logs-write"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" },
        "level": { "type": "keyword" }
      }
    }
  },
  "composed_of": ["common-settings", "log-mappings"],
  "priority": 200
}
```

### 15. Security

#### Authentication
- Native realm (username/password with bcrypt)
- LDAP/Active Directory integration
- SAML / OpenID Connect SSO
- API key authentication
- PKI (certificate-based)
- Token-based (short-lived bearer tokens)

#### Authorization (RBAC)
```json
{
  "role": {
    "cluster": ["monitor", "manage_index_templates"],
    "indices": [
      {
        "names": ["products-*"],
        "privileges": ["read", "view_index_metadata"],
        "field_security": {
          "grant": ["title", "description", "price", "brand"]
        },
        "query": {
          "term": { "department": "${user.metadata.department}" }
        }
      }
    ]
  }
}
```

- **Index-level**: read, write, manage per index pattern
- **Field-level security**: Restrict visible fields per role
- **Document-level security**: Filter documents per role via query
- **Cluster-level**: monitor, manage, admin privileges

#### Audit Logging
Log security events: authentication success/failure, access denied, index operations, admin actions.

---

## Implementation Phases

### Phase 1: Core Search Engine
- Inverted index construction (in-memory + flush to segments)
- Standard analyzer pipeline (tokenizer + lowercase + stop words)
- BM25 scoring
- Basic query types: match, term, bool, range, prefix
- Single-node, single-index operation
- REST API (index, search, delete)

### Phase 2: Analysis & Query Expansion
- Custom analyzers (configurable tokenizers, char filters, token filters)
- Fuzzy search (Levenshtein automaton)
- Phrase matching with slop
- Wildcard and regexp queries
- Multi-field search with boosting
- Highlighting (unified highlighter)
- Term/phrase suggesters

### Phase 3: Aggregations & Analytics
- Bucket aggregations (terms, histogram, date_histogram, range)
- Metric aggregations (stats, percentiles, cardinality)
- Nested aggregations
- Pipeline aggregations (derivative, moving_avg, bucket_selector)
- Significant terms

### Phase 4: Advanced Features
- Geo queries (distance, bounding box, geo_shape)
- Completion suggester (FST-based autocomplete)
- Nested document queries
- Percolate queries (reverse search)
- Ingest pipelines
- Scripting (Painless-like sandboxed language)

### Phase 5: Distribution & Lifecycle
- Sharding (hash-based document routing)
- Replication (primary + replica shards)
- Distributed search (scatter-gather)
- Near-real-time search (refresh interval)
- Index lifecycle management (hot/warm/cold/delete)
- Rollover and index templates
- Snapshot/restore

### Phase 6: Vector & Hybrid Search
- Dense vector field type with HNSW index
- Approximate kNN search
- Hybrid search (BM25 + kNN with RRF)
- Vector quantization (scalar, product)
- Pre-filtering for kNN

### Phase 7: Security & Observability
- Authentication (native, API key, LDAP)
- RBAC with field/document-level security
- TLS for node-to-node and client communication
- Audit logging
- Cluster health monitoring
- Slow query log
- Index statistics and metrics

---

## Configuration Reference

### Index Settings
```json
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "1s",
    "max_result_window": 10000,
    "max_inner_result_window": 100,
    "codec": "best_compression",
    "sort.field": "created_at",
    "sort.order": "desc",
    "merge.policy.max_merge_at_once": 10,
    "merge.policy.max_merged_segment": "5gb",
    "merge.policy.segments_per_tier": 10,
    "merge.scheduler.max_thread_count": 1,
    "translog.durability": "request",
    "translog.sync_interval": "5s",
    "translog.flush_threshold_size": "512mb",
    "indexing_pressure.memory.limit": "10%"
  }
}
```

### Cluster Settings
```json
{
  "persistent": {
    "cluster.routing.allocation.awareness.attributes": "zone",
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%",
    "indices.breaker.total.limit": "70%",
    "indices.breaker.fielddata.limit": "40%",
    "indices.breaker.request.limit": "60%",
    "search.max_buckets": 65535,
    "action.destructive_requires_name": true
  }
}
```

---

## Compatibility Notes

### Elasticsearch API Compatibility
The SKSearch provider targets compatibility with the Elasticsearch 8.x REST API surface for:
- Document CRUD operations
- Search API (query DSL)
- Aggregation API
- Index management API
- Bulk API
- Scroll / Search After / PIT
- Cat APIs (human-readable cluster info)

This enables drop-in replacement for applications using standard Elasticsearch clients.

### Key Differences from Elasticsearch
- **License**: True open-source (Apache 2.0 or MIT)
- **JVM**: No JVM dependency — native Rust implementation
- **Memory model**: No heap sizing complexity; memory-mapped segments with explicit cache control
- **Scoring**: Pluggable scoring backends (BM25, TF-IDF, custom)
- **Vector search**: First-class citizen, not bolted on

---

*This blueprint serves as the definitive specification for generating search engine implementations via the Forgeprint system. All features, APIs, and architectural decisions are codified here for reproducible, high-quality code generation.*
