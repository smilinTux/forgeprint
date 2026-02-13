# Search Engine Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any generated search engine implementation. Every test MUST pass for the implementation to be considered complete and production-ready. Tests are organized by functional area and include both correctness verification and edge case handling.

## Test Categories

### 1. Analyzer Pipeline Tests

#### 1.1 Basic Tokenization
**Test: `test_standard_analyzer`**
- **Purpose**: Verify standard analyzer tokenizes text correctly
- **Input**: "The Quick-Brown Fox's Email: test@example.com"
- **Expected Output**: ["the", "quick", "brown", "fox's", "email", "test", "example.com"]
- **Assert**: Token count, token text, positions, and offsets are correct

**Test: `test_whitespace_analyzer`**
- **Purpose**: Verify whitespace-only tokenization
- **Input**: "Hello    World\t\nTabs"
- **Expected Output**: ["Hello", "World", "Tabs"]
- **Assert**: Only whitespace characters split tokens

**Test: `test_keyword_analyzer`**
- **Purpose**: Verify entire input treated as single token
- **Input**: "New York City"
- **Expected Output**: ["New York City"]
- **Assert**: Exact input preservation

#### 1.2 Language-Specific Analysis
**Test: `test_english_analyzer`**
- **Purpose**: Verify English stemming and stop word removal
- **Input**: "The dogs are running quickly in the park"
- **Expected Output**: ["dog", "run", "quick", "park"]
- **Assert**: Stop words ("the", "are", "in") removed, stemming applied ("dogs"→"dog", "running"→"run", "quickly"→"quick")

**Test: `test_multilingual_analysis`**
- **Purpose**: Verify language-specific analyzers
- **French Input**: "Les chiens courent rapidement"
- **Expected Output**: ["chien", "cour", "rapid"]
- **Assert**: French stop words removed, French stemming applied

#### 1.3 Custom Analyzers
**Test: `test_custom_analyzer_pipeline`**
- **Purpose**: Verify custom analyzer chain execution order
- **Configuration**:
  ```json
  {
    "char_filter": ["html_strip"],
    "tokenizer": "standard",
    "filter": ["lowercase", "stop", "stemmer"]
  }
  ```
- **Input**: "<p>The RUNNING dogs</p>"
- **Expected Output**: ["run", "dog"]
- **Assert**: HTML stripped, lowercase applied, stop words removed, stemming applied

**Test: `test_synonym_filter`**
- **Purpose**: Verify synonym expansion
- **Synonyms**: "laptop,notebook,computer"
- **Input**: "laptop"
- **Expected Output**: ["laptop", "notebook", "computer"]
- **Assert**: All synonyms generated at same position

**Test: `test_ngram_tokenizer`**
- **Purpose**: Verify n-gram generation
- **Configuration**: min_gram=2, max_gram=3
- **Input**: "fox"
- **Expected Output**: ["fo", "fox", "ox"]
- **Assert**: Correct n-gram boundaries and overlaps

#### 1.4 Edge Cases
**Test: `test_empty_input_analysis`**
- **Input**: ""
- **Expected Output**: []
- **Assert**: No tokens generated, no errors thrown

**Test: `test_unicode_analysis`**
- **Input**: "Café naïve résumé"
- **Expected Output**: ["café", "naïve", "résumé"]
- **Assert**: Unicode characters preserved and normalized correctly

**Test: `test_very_long_token`**
- **Input**: Single token of 10,000 characters
- **Assert**: Token handled gracefully, possibly truncated with configurable limits

### 2. Index Operations Tests

#### 2.1 Document Indexing
**Test: `test_single_document_indexing`**
- **Purpose**: Verify basic document indexing workflow
- **Action**: Index document with text, keyword, numeric, and date fields
- **Assert**: 
  - Document retrievable by ID
  - All fields searchable
  - Field types correctly identified
  - Document count incremented

**Test: `test_bulk_indexing`**
- **Purpose**: Verify bulk indexing API
- **Action**: Index 1,000 documents in single bulk request
- **Assert**:
  - All documents indexed successfully
  - Bulk response contains individual operation results
  - Index statistics updated correctly
  - No memory leaks

**Test: `test_document_update`**
- **Purpose**: Verify document update semantics
- **Setup**: Index document with id="doc1", content="original"
- **Action**: Update document with content="updated"
- **Assert**:
  - Old content no longer searchable
  - New content searchable
  - Document version incremented
  - Update reflected in real-time

**Test: `test_document_deletion`**
- **Purpose**: Verify document deletion
- **Setup**: Index document with id="doc1"
- **Action**: Delete document
- **Assert**:
  - Document no longer retrievable by ID
  - Document not returned in search results
  - Delete reflected in document count
  - Tombstone tracking correct

#### 2.2 Index Management
**Test: `test_index_creation_with_mapping`**
- **Purpose**: Verify explicit index creation
- **Action**: Create index with explicit field mappings
- **Assert**:
  - Index exists and is searchable
  - Field types match mapping specification
  - Index settings applied correctly
  - Dynamic mapping disabled if specified

**Test: `test_index_alias_operations`**
- **Purpose**: Verify index alias functionality
- **Action**: Create alias pointing to index, then atomic swap to new index
- **Assert**:
  - Alias resolves to correct index
  - Searches via alias work correctly
  - Atomic alias swap is successful
  - Old index remains accessible directly

**Test: `test_index_template_application`**
- **Purpose**: Verify index templates apply to new indices
- **Setup**: Create template matching pattern "logs-*"
- **Action**: Create index "logs-2025-01-15"
- **Assert**:
  - Template mappings applied to new index
  - Template settings applied
  - Template order respected for conflicts

#### 2.3 Refresh and Flush Operations
**Test: `test_near_real_time_search`**
- **Purpose**: Verify refresh makes documents searchable
- **Action**: Index document, verify not immediately searchable, call refresh, verify searchable
- **Timeline**:
  - t=0: Index document
  - t=0: Search → 0 results (not refreshed)
  - t=0: Call refresh API
  - t=0: Search → 1 result (now visible)

**Test: `test_durable_flush`**
- **Purpose**: Verify flush persists data durably
- **Action**: Index documents, flush, simulate crash, restart
- **Assert**: All flushed documents survive restart and are searchable

### 3. Query Correctness Tests

#### 3.1 Term-Level Queries
**Test: `test_term_query_exact_match`**
- **Setup**: Index document with `status: "published"`
- **Query**: `{"term": {"status": "published"}}`
- **Assert**: Document matches
- **Query**: `{"term": {"status": "PUBLISHED"}}`  (case difference)
- **Assert**: Document does NOT match (keyword field is case-sensitive)

**Test: `test_terms_query_multiple_values`**
- **Setup**: Index documents with `category: "electronics"`, `category: "books"`
- **Query**: `{"terms": {"category": ["electronics", "sports"]}}`
- **Assert**: Only electronics document matches

**Test: `test_range_query_numeric`**
- **Setup**: Index documents with `price: [50, 100, 150, 200]`
- **Query**: `{"range": {"price": {"gte": 75, "lte": 175}}}`
- **Assert**: Documents with price 100 and 150 match

**Test: `test_exists_query`**
- **Setup**: Index documents with and without "description" field
- **Query**: `{"exists": {"field": "description"}}`
- **Assert**: Only documents with description field match

**Test: `test_prefix_query`**
- **Setup**: Index documents with `brand: ["Apple", "Samsung", "Amazon"]`
- **Query**: `{"prefix": {"brand": "A"}}`
- **Assert**: Apple and Amazon documents match, Samsung does not

**Test: `test_wildcard_query`**
- **Setup**: Index documents with `filename: ["test.txt", "data.csv", "report.pdf"]`
- **Query**: `{"wildcard": {"filename": "*.txt"}}`
- **Assert**: Only test.txt matches
- **Query**: `{"wildcard": {"filename": "*t*"}}`
- **Assert**: test.txt and report.pdf match

**Test: `test_regexp_query`**
- **Setup**: Index documents with `sku: ["ABC-123", "XYZ-456", "DEF-789"]`
- **Query**: `{"regexp": {"sku": "[A-Z]{3}-[0-9]{3}"}}`
- **Assert**: All documents match the pattern

#### 3.2 Full-Text Queries
**Test: `test_match_query_analyzed`**
- **Setup**: Index document with `title: "The Quick Brown Fox"`
- **Query**: `{"match": {"title": "quick fox"}}`
- **Assert**: Document matches (case insensitive, order independent)
- **Query**: `{"match": {"title": "slow"}}`
- **Assert**: Document does NOT match

**Test: `test_match_phrase_query`**
- **Setup**: Index document with `content: "The quick brown fox jumps"`
- **Query**: `{"match_phrase": {"content": "quick brown"}}`
- **Assert**: Document matches (exact phrase)
- **Query**: `{"match_phrase": {"content": "quick fox"}}`
- **Assert**: Document does NOT match (not adjacent)

**Test: `test_match_phrase_with_slop`**
- **Setup**: Index document with `content: "The quick brown fox jumps"`
- **Query**: `{"match_phrase": {"content": {"query": "quick fox", "slop": 1}}}`
- **Assert**: Document matches (one word allowed between)
- **Query**: `{"match_phrase": {"content": {"query": "quick jumps", "slop": 1}}}`
- **Assert**: Document does NOT match (two words between, slop=1)

**Test: `test_multi_match_query`**
- **Setup**: Index document with `title: "Elasticsearch Guide"`, `description: "Search engine tutorial"`
- **Query**: `{"multi_match": {"query": "search", "fields": ["title", "description"]}}`
- **Assert**: Document matches (found in description field)
- **Scoring**: Verify field boost affects relevance scores

#### 3.3 Boolean Queries
**Test: `test_bool_must_clause`**
- **Setup**: Index documents with various `category` and `status` combinations
- **Query**: 
  ```json
  {
    "bool": {
      "must": [
        {"term": {"category": "electronics"}},
        {"term": {"status": "active"}}
      ]
    }
  }
  ```
- **Assert**: Only documents matching BOTH conditions return

**Test: `test_bool_should_clause`**
- **Query**:
  ```json
  {
    "bool": {
      "should": [
        {"term": {"category": "electronics"}},
        {"term": {"category": "books"}}
      ],
      "minimum_should_match": 1
    }
  }
  ```
- **Assert**: Documents matching EITHER condition return

**Test: `test_bool_must_not_clause`**
- **Query**:
  ```json
  {
    "bool": {
      "must": [{"match_all": {}}],
      "must_not": [{"term": {"status": "deleted"}}]
    }
  }
  ```
- **Assert**: All documents except those with `status: "deleted"` return

**Test: `test_bool_filter_clause`**
- **Query**:
  ```json
  {
    "bool": {
      "must": [{"match": {"title": "search"}}],
      "filter": [{"range": {"price": {"gte": 100}}}]
    }
  }
  ```
- **Assert**: Filter applies but does not affect relevance scoring

#### 3.4 Fuzzy Search
**Test: `test_fuzzy_query_single_edit`**
- **Setup**: Index document with `title: "elasticsearch"`
- **Query**: `{"fuzzy": {"title": {"value": "elasticsarch", "fuzziness": 1}}}`
- **Assert**: Document matches (1 character substitution: e→a)

**Test: `test_fuzzy_query_auto_fuzziness`**
- **Setup**: Index documents with various spellings
- **Query**: `{"fuzzy": {"title": {"value": "searching", "fuzziness": "AUTO"}}}`
- **Test Cases**:
  - "search" (7 chars) → max 1 edit allowed
  - "searchng" (8 chars) → max 2 edits allowed
- **Assert**: Edit distance limits respected based on term length

**Test: `test_fuzzy_query_with_prefix`**
- **Setup**: Index document with `title: "bluetooth"`
- **Query**: `{"fuzzy": {"title": {"value": "blutooth", "prefix_length": 2}}}`
- **Assert**: Document matches (prefix "bl" must be exact, rest fuzzy)
- **Query**: `{"fuzzy": {"title": {"value": "xlutooth", "prefix_length": 2}}}`
- **Assert**: Document does NOT match (prefix "xl" ≠ "bl")

**Test: `test_match_query_with_fuzziness`**
- **Setup**: Index document with `title: "wireless headphones"`
- **Query**: `{"match": {"title": {"query": "wirelss hedphones", "fuzziness": 1}}}`
- **Assert**: Document matches despite typos

### 4. Aggregation Tests

#### 4.1 Bucket Aggregations
**Test: `test_terms_aggregation`**
- **Setup**: Index documents with `category: ["electronics", "books", "electronics", "clothing"]`
- **Query**:
  ```json
  {
    "size": 0,
    "aggs": {
      "categories": {
        "terms": {"field": "category", "size": 10}
      }
    }
  }
  ```
- **Expected Result**:
  ```json
  {
    "aggregations": {
      "categories": {
        "buckets": [
          {"key": "electronics", "doc_count": 2},
          {"key": "books", "doc_count": 1},
          {"key": "clothing", "doc_count": 1}
        ]
      }
    }
  }
  ```

**Test: `test_range_aggregation`**
- **Setup**: Index documents with `price: [25, 75, 125, 175, 225]`
- **Query**:
  ```json
  {
    "aggs": {
      "price_ranges": {
        "range": {
          "field": "price",
          "ranges": [
            {"to": 50},
            {"from": 50, "to": 150},
            {"from": 150}
          ]
        }
      }
    }
  }
  ```
- **Expected Result**: 3 buckets with doc counts [1, 2, 2]

**Test: `test_date_histogram_aggregation`**
- **Setup**: Index documents with timestamps spanning multiple days
- **Query**:
  ```json
  {
    "aggs": {
      "daily_counts": {
        "date_histogram": {
          "field": "@timestamp",
          "calendar_interval": "day"
        }
      }
    }
  }
  ```
- **Assert**: Buckets created for each day with correct document counts

**Test: `test_nested_aggregations`**
- **Setup**: Index documents with `category` and `price` fields
- **Query**: Terms aggregation on category with sub-aggregation for average price
- **Assert**: Each category bucket contains correct average price calculation

#### 4.2 Metric Aggregations
**Test: `test_stats_aggregation`**
- **Setup**: Index documents with `price: [10, 20, 30, 40, 50]`
- **Query**:
  ```json
  {
    "aggs": {
      "price_stats": {
        "stats": {"field": "price"}
      }
    }
  }
  ```
- **Expected Result**:
  ```json
  {
    "aggregations": {
      "price_stats": {
        "count": 5,
        "min": 10,
        "max": 50,
        "avg": 30,
        "sum": 150
      }
    }
  }
  ```

**Test: `test_percentiles_aggregation`**
- **Setup**: Index 100 documents with `response_time` field (normal distribution)
- **Query**: Percentiles aggregation for 50th, 95th, 99th percentiles
- **Assert**: Percentile values are reasonable and ordered correctly

**Test: `test_cardinality_aggregation`**
- **Setup**: Index documents with varying numbers of unique values in `user_id` field
- **Query**: Cardinality aggregation on `user_id`
- **Assert**: Estimated unique count is within acceptable error bounds (±5% for HyperLogLog++)

#### 4.3 Pipeline Aggregations
**Test: `test_cumulative_sum_aggregation`**
- **Setup**: Date histogram with doc counts per day
- **Query**: Add cumulative sum pipeline aggregation
- **Assert**: Each bucket shows running total of previous buckets

**Test: `test_moving_average_aggregation`**
- **Setup**: Date histogram with metric values
- **Query**: Apply moving average with window size 3
- **Assert**: Moving average calculated correctly for each bucket

### 5. Relevance Scoring Tests

#### 5.1 BM25 Scoring
**Test: `test_bm25_term_frequency_saturation`**
- **Setup**: 
  - Document A: "search search search" (tf=3)
  - Document B: "search" (tf=1)
- **Query**: `{"match": {"content": "search"}}`
- **Assert**: Document A scores higher than B, but with diminishing returns (tf saturation)

**Test: `test_bm25_document_length_normalization`**
- **Setup**:
  - Document A: "search" (short document)
  - Document B: "search" + 1000 other words (long document)
- **Query**: `{"match": {"content": "search"}}`
- **Assert**: Document A (shorter) scores higher than Document B due to length normalization

**Test: `test_bm25_inverse_document_frequency`**
- **Setup**:
  - 100 documents containing "the"
  - 1 document containing "elasticsearch"
- **Query**: `{"match": {"content": "elasticsearch"}}`
- **Assert**: Document with rare term "elasticsearch" scores significantly higher than common term "the"

#### 5.2 Multi-Field Scoring
**Test: `test_multi_match_best_fields`**
- **Setup**: Document with `title: "search"`, `description: "irrelevant content"`
- **Query**: Multi-match across title^3 and description
- **Assert**: Score reflects boosted title field contribution

**Test: `test_multi_match_cross_fields`**
- **Setup**: Document with `first_name: "John"`, `last_name: "Smith"`
- **Query**: Multi-match "John Smith" with cross_fields type
- **Assert**: Cross-field scoring treats fields as combined field

#### 5.3 Function Score
**Test: `test_function_score_field_value_factor`**
- **Setup**: Documents with `popularity: [1, 5, 10]` and matching text content
- **Query**: Function score with field_value_factor on popularity
- **Assert**: Higher popularity values result in higher final scores

**Test: `test_function_score_decay`**
- **Setup**: Documents with `created_date` ranging from recent to old
- **Query**: Function score with gaussian decay on recency
- **Assert**: More recent documents score higher with decay applied

### 6. Geospatial Tests

#### 6.1 Geo Point Queries
**Test: `test_geo_distance_query`**
- **Setup**: Index documents with `location: {"lat": 40.7589, "lon": -73.9851}` (NYC)
- **Query**: Geo distance query within 10km of Central Park
- **Assert**: NYC document matches, documents >10km away do not

**Test: `test_geo_bounding_box_query`**
- **Setup**: Index documents across different geographic regions
- **Query**: Geo bounding box covering New York state
- **Assert**: Only documents within bounding box match

**Test: `test_geo_distance_sorting`**
- **Setup**: Index documents at various distances from reference point
- **Query**: Sort by distance from reference point
- **Assert**: Results ordered by actual geographic distance

#### 6.2 Geo Aggregations
**Test: `test_geo_distance_aggregation`**
- **Setup**: Index documents at various distances from city center
- **Query**: Geo distance aggregation with ranges [0-5km, 5-10km, 10km+]
- **Assert**: Documents correctly bucketed by distance ranges

### 7. Vector Search Tests

#### 7.1 Dense Vector Operations
**Test: `test_vector_indexing_and_retrieval`**
- **Setup**: Index documents with dense_vector field (768 dimensions)
- **Action**: Store and retrieve vector data
- **Assert**: Vector data stored and retrieved exactly (no precision loss)

**Test: `test_knn_search_basic`**
- **Setup**: Index 1000 documents with random 128-dim vectors
- **Query**: kNN search for k=10 nearest neighbors
- **Assert**: 
  - Returns exactly 10 results
  - Results ordered by similarity score
  - Similarity scores in descending order

**Test: `test_knn_with_filter`**
- **Setup**: Index documents with vectors and metadata fields
- **Query**: kNN search with filter on metadata
- **Assert**: 
  - Only documents matching filter considered
  - kNN performed within filtered subset
  - Correct number of results returned

#### 7.2 Hybrid Search
**Test: `test_hybrid_search_bm25_plus_knn`**
- **Setup**: Index documents with both text content and vectors
- **Query**: Combine text match query with kNN search using RRF
- **Assert**: 
  - Both text and vector relevance contribute to final ranking
  - RRF properly combines different ranking approaches

### 8. Edge Cases and Error Handling

#### 8.1 Large Data Handling
**Test: `test_large_document_indexing`**
- **Action**: Index document with 10MB of text content
- **Assert**: Document indexed successfully without memory issues

**Test: `test_many_fields_document`**
- **Action**: Index document with 10,000 fields
- **Assert**: All fields indexed and searchable, performance remains acceptable

**Test: `test_deep_nested_objects`**
- **Action**: Index document with deeply nested object structure (100 levels)
- **Assert**: Nested structure handled correctly without stack overflow

#### 8.2 Concurrent Operations
**Test: `test_concurrent_indexing_and_searching`**
- **Action**: Run indexing operations on one thread while performing searches on another
- **Assert**: 
  - No data corruption
  - Searches return consistent results
  - New documents become searchable after refresh

**Test: `test_concurrent_updates_same_document`**
- **Action**: Update same document from multiple threads simultaneously
- **Assert**: 
  - Final document state is consistent
  - No partial updates visible
  - Document versioning works correctly

#### 8.3 Resource Exhaustion
**Test: `test_memory_pressure_handling`**
- **Action**: Index documents until memory pressure thresholds reached
- **Assert**: 
  - Circuit breakers trigger appropriately
  - Graceful degradation of service
  - No out-of-memory crashes

**Test: `test_disk_space_exhaustion`**
- **Action**: Fill disk space during indexing operations
- **Assert**: 
  - Operations fail gracefully with appropriate error messages
  - Index remains in consistent state
  - Recovery possible after disk space freed

---

## Test Execution Requirements

### 1. Test Environment Setup
**Prerequisites**: 
- Clean index state before each test
- Consistent document corpus for comparative tests  
- Configurable timeouts for performance-sensitive tests

### 2. Assertion Helpers
**Score Comparison**: Helper methods to compare relevance scores with tolerance
**Collection Equality**: Deep comparison of search results ignoring order where appropriate
**Approximation Testing**: For algorithms with approximate results (cardinality, percentiles)

### 3. Performance Thresholds
**Query Latency**: No single query should exceed 1 second in unit tests
**Memory Usage**: Memory usage should return to baseline after test completion
**Index Size**: Verify index size grows proportionally to data volume

Every test must pass reliably in isolation and as part of the complete test suite. Flaky tests indicate implementation issues that must be resolved before deployment.