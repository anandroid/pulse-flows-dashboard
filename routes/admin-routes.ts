import { Request, Response, Router } from 'express';
import { ContentService } from '../../services/content-service';
import { FirestoreService } from '../../services/firestore-adapter';
import { EmbeddingService } from '../../services/embedding-service';
import { AreasService } from '../../services/areas-service';
import { LabelPropagationService } from '../../services/label-propagation-service';
import { PatternRecognitionService } from '../../services/pattern-recognition-service';
import { LLMChatService } from '../../services/llm-chat-service';
import { CorrectionsService } from '../../services/corrections-service';
import { AgentEvaluationService } from '../../services/agent-evaluation-service';
import { RulesEngineService } from '../../services/rules-engine-service';
import { locationEmbeddingRegenerationService } from '../../services/location-embedding-regeneration-service';
import { supabase } from 'pulse-ai-utils';
import { OpenAIHelper } from '../../services/pulse-ai-utils-safe';

const router = Router();
const contentService = new ContentService();
const firestoreService = new FirestoreService('pulse');
const embeddingService = new EmbeddingService();
const areasService = new AreasService();
const labelPropagationService = new LabelPropagationService();
const patternRecognitionService = new PatternRecognitionService();
const llmChatService = new LLMChatService();
const correctionsService = new CorrectionsService();
const agentEvaluationService = new AgentEvaluationService();
const rulesEngineService = new RulesEngineService();

// Serve the admin page
router.get('/content-labeling', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/content-labeling.html'));
});

// Serve the table-based admin page
router.get('/content-labeling-table', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/content-labeling-table.html'));
});

// Serve the debug tools admin page
router.get('/debug', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/admin-debug.html'));
});

// Serve the clusters admin page
router.get('/clusters', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/clusters.html'));
});

// Get content for labeling
router.get('/content', async (req: Request, res: Response) => {
  try {
    const { area, date, category } = req.query;
    
    if (!area) {
      return res.status(400).json({ 
        success: false, 
        error: 'Area parameter is required' 
      });
    }

    // Get content for the specified area and date
    let content;
    if (date) {
      content = await contentService.getContentByAreaAndDate(
        area as string, 
        new Date(date as string)
      );
    } else {
      content = await contentService.getContentByArea(area as string);
    }

    // Filter by category if specified
    if (category) {
      content = content.filter(item => item.category === category);
    }

    // Sort by timestamp descending
    content.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Limit to 200 items for performance
    content = content.slice(0, 200);

    return res.json({
      success: true,
      area,
      count: content.length,
      content
    });

  } catch (error) {
    console.error('Error fetching content for labeling:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch content'
    });
  }
});

// Save labels and generate embeddings
router.post('/labels', async (req: Request, res: Response) => {
  try {
    const { area, labels, timestamp, propagate = true, originalEvaluation, corrections } = req.body;
    
    if (!area || !labels || !Array.isArray(labels)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body'
      });
    }

    console.log(`Saving ${labels.length} labels for area ${area}`);

    // Save labels to a dedicated collection
    const labelBatch = {
      area,
      timestamp,
      labelCount: labels.length,
      labels: labels
    };

    // Store the label batch
    const batchId = `${area}_${new Date().toISOString().split('T')[0]}_${Date.now()}`;
    await firestoreService.setDocument('content_labels', batchId, labelBatch);

    // Update each content item with its labels
    let savedCount = 0;
    let propagationResults = [];
    
    for (const labelData of labels) {
      try {
        // Update the content document with labels
        await firestoreService.updateDocument('content', labelData.contentId, {
          labels: labelData.labels,
          labeledAt: timestamp,
          labeledBy: 'admin' // You can add user info here
        });

        // Generate embedding if not exists
        const contentDoc = await firestoreService.getDocument('content', labelData.contentId);
        if (contentDoc.exists) {
          const content = contentDoc.data();
          
          // Generate embedding if missing
          if (!content?.embedding) {
            await embeddingService.generateAndStoreEmbedding(
              labelData.contentId,
              content
            );
            // Refresh content with new embedding
            const updatedDoc = await firestoreService.getDocument('content', labelData.contentId);
            content.embedding = updatedDoc.data()?.embedding;
          }
          
          // Update clustering system with labeled content
          if (content?.embedding) {
            try {
              const { ClusteringService } = await import('../../services/clustering-service');
              const { SourceLabelService } = await import('../../services/source-label-service');
              const clusteringService = new ClusteringService();
              const sourceLabelService = new SourceLabelService();
              
              // Add to cluster
              await clusteringService.addToCluster(
                content,
                content.embedding,
                labelData.labels
              );
              
              // Update source rules
              if (content.source) {
                await sourceLabelService.updateSourceRules(
                  content,
                  labelData.labels
                );
              }
              
              console.log(`🎯 Updated cluster for ${labelData.contentId}`);
              
              // Also update filter clusters
              const { FilterClusteringService } = await import('../../services/filter-clustering-service');
              const filterClusteringService = new FilterClusteringService();
              
              await filterClusteringService.processLabeledContent(
                labelData.contentId,
                area,
                labelData.labels,
                content
              );
              
              console.log(`🎯 Updated filter clusters for ${labelData.contentId}`);
            } catch (clusterError) {
              console.warn(`Failed to update clusters for ${labelData.contentId}:`, clusterError);
            }
          }
        }

        // Propagate labels if enabled
        if (propagate && labelData.labels.scope === 'national') {
          const propagationResult = await labelPropagationService.propagateLabels(
            contentDoc.data(),
            labelData.labels,
            {
              propagateToSameSource: true,
              propagateBySimilarity: true,
              similarityThreshold: 0.85,
              applyRules: false // Don't apply rules on each save
            }
          );
          propagationResults.push(propagationResult);
        }

        savedCount++;
      } catch (error) {
        console.error(`Failed to save label for ${labelData.contentId}:`, error);
      }
    }

    // Store corrections if provided
    let correctionsStored = 0;
    if (corrections && corrections.length > 0) {
      console.log(`[AdminRoutes] Storing ${corrections.length} corrections`);
      
      for (const correction of corrections) {
        try {
          const contentDoc = await firestoreService.getDocument('content', correction.contentId);
          if (contentDoc.exists) {
            await correctionsService.storeCorrection(
              correction.contentId,
              contentDoc.data(),
              correction.originalRating,
              correction.correctedRating,
              correction.reason
            );
            correctionsStored++;
          }
        } catch (error) {
          console.error(`Failed to store correction for ${correction.contentId}:`, error);
        }
      }
    }

    // Update area profile if needed
    await updateAreaProfile(area);

    // Calculate total propagated items
    const totalPropagated = propagationResults.reduce((sum, result) => 
      sum + result.totalUpdated, 0
    );

    return res.json({
      success: true,
      saved: savedCount,
      batchId,
      propagated: totalPropagated,
      correctionsStored,
      message: `Saved ${savedCount} labels${totalPropagated > 0 ? ` and propagated to ${totalPropagated} similar items` : ''}${correctionsStored > 0 ? ` and stored ${correctionsStored} corrections for learning` : ''}`
    });

  } catch (error) {
    console.error('Error saving labels:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save labels'
    });
  }
});

// Get label suggestions for content
router.get('/labels/suggestions/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    
    const suggestions = await labelPropagationService.getSuggestionsForContent(contentId);
    
    return res.json({
      success: true,
      contentId,
      suggestions
    });
    
  } catch (error) {
    console.error('Error getting label suggestions:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get suggestions'
    });
  }
});

// Store a teaching correction with explanation
router.post('/corrections/teach', async (req: Request, res: Response) => {
  try {
    const { contentId, originalRating, correctedRating, reason, lesson } = req.body;
    
    if (!contentId || !originalRating || !correctedRating) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Get content details
    const contentDoc = await firestoreService.getDocument('content', contentId);
    if (!contentDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Content not found'
      });
    }
    
    const correctionId = await correctionsService.storeCorrection(
      contentId,
      contentDoc.data(),
      originalRating,
      correctedRating,
      reason
    );
    
    // If lesson is provided, update the correction with it
    if (lesson) {
      await firestoreService.updateDocument('label_corrections', correctionId, {
        lessonLearned: lesson
      });
    }
    
    return res.json({
      success: true,
      correctionId,
      message: 'Correction stored successfully'
    });
    
  } catch (error) {
    console.error('Error storing teaching correction:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store correction'
    });
  }
});

// Get similar corrections for a content item
router.post('/corrections/similar', async (req: Request, res: Response) => {
  try {
    const { content, limit = 3 } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }
    
    const similarCorrections = await correctionsService.findSimilarCorrections(
      content,
      limit,
      0.7 // Lower threshold for finding related corrections
    );
    
    return res.json({
      success: true,
      corrections: similarCorrections,
      count: similarCorrections.length
    });
    
  } catch (error) {
    console.error('Error finding similar corrections:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find similar corrections'
    });
  }
});

// Get corrections for learning context
router.get('/corrections/context/:area', async (req: Request, res: Response) => {
  try {
    const { area } = req.params;
    const { category, source } = req.query;
    
    const corrections = await correctionsService.getRelevantCorrections(
      area,
      category as string,
      source as string,
      5
    );
    
    const formattedContext = correctionsService.formatCorrectionsAsExamples(corrections);
    
    return res.json({
      success: true,
      corrections,
      formattedContext,
      count: corrections.length
    });
    
  } catch (error) {
    console.error('Error getting corrections context:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get corrections context'
    });
  }
});

// Store a correction
router.post('/corrections', async (req: Request, res: Response) => {
  try {
    const {
      contentId,
      contentSnapshot,
      area,
      originalRating,
      correctedRating,
      correctionReason
    } = req.body;
    
    if (!contentId || !contentSnapshot || !area || !originalRating || !correctedRating) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Add area to contentSnapshot if not present
    const contentWithArea = {
      ...contentSnapshot,
      area: area
    };
    
    // Store the correction
    const correctionId = await correctionsService.storeCorrection(
      contentId,
      contentWithArea,
      originalRating,
      correctedRating,
      correctionReason || 'Manual correction'
    );
    
    return res.json({
      success: true,
      correctionId,
      message: 'Correction stored successfully'
    });
    
  } catch (error) {
    console.error('Error storing correction:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store correction'
    });
  }
});

// Learn from corrections
router.post('/corrections/learn', async (req: Request, res: Response) => {
  try {
    console.log('[AdminRoutes] Learning from corrections...');
    
    const result = await agentEvaluationService.learnFromCorrections();
    
    return res.json({
      success: true,
      message: `Found ${result.patternsFound} patterns and created ${result.rulesCreated} rules`,
      result
    });
    
  } catch (error) {
    console.error('Error learning from corrections:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to learn from corrections'
    });
  }
});

// Get labeling statistics
router.get('/labels/stats', async (req: Request, res: Response) => {
  try {
    const { area } = req.query;
    
    // Get labeled content counts
    const stats = {
      totalLabeled: 0,
      byArea: {} as Record<string, number>,
      byScope: {
        local: 0,
        national: 0,
        hyperlocal: 0
      },
      byCategory: {} as Record<string, number>
    };

    // Query labeled content
    const collection = await firestoreService.getCollection('content');
    const labeledContent: any[] = [];
    
    collection.forEach((doc: any) => {
      const data = doc.data();
      if (data.labels && (!area || data.area === area)) {
        labeledContent.push({ id: doc.id, ...data });
      }
    });
    
    // Process labeled content for stats
    labeledContent.forEach(data => {
      stats.totalLabeled++;
      
      // Count by area
      stats.byArea[data.area] = (stats.byArea[data.area] || 0) + 1;
      
      // Count by scope
      if (data.labels?.scope) {
        const scope = data.labels.scope as keyof typeof stats.byScope;
        if (scope in stats.byScope) {
          stats.byScope[scope] = (stats.byScope[scope] || 0) + 1;
        }
      }
      
      // Count by category
      stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
    });

    return res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching label stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stats'
    });
  }
});

// Get current labeling guide
router.get('/chat/labeling-guide', (req: Request, res: Response) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const guidePath = path.join(__dirname, '../../docs/LABELING_GUIDE.md');
    
    if (fs.existsSync(guidePath)) {
      const guide = fs.readFileSync(guidePath, 'utf-8');
      return res.json({
        success: true,
        guide: guide,
        lastModified: fs.statSync(guidePath).mtime
      });
    } else {
      return res.json({
        success: false,
        error: 'Labeling guide not found'
      });
    }
  } catch (error) {
    console.error('Error reading labeling guide:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to read labeling guide'
    });
  }
});

// Get available LLM models
router.get('/chat/models', (req: Request, res: Response) => {
  try {
    const models = llmChatService.getAvailableModels();
    return res.json({
      success: true,
      models
    });
  } catch (error) {
    console.error('Error getting models:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get available models'
    });
  }
});

// Generate default evaluation prompt
router.post('/chat/default-prompt', async (req: Request, res: Response) => {
  try {
    const { area, contentCount } = req.body;
    
    if (!area || !contentCount) {
      return res.status(400).json({
        success: false,
        error: 'Area and contentCount are required'
      });
    }

    const defaultPrompt = llmChatService.generateDefaultPrompt(area, contentCount);
    
    return res.json({
      success: true,
      prompt: defaultPrompt
    });
  } catch (error) {
    console.error('Error generating default prompt:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate default prompt'
    });
  }
});

// Evaluate content with agent approach
router.post('/chat/evaluate/agent', async (req: Request, res: Response) => {
  try {
    const { area, content, prompt, model, useRules, useCorrections, areaFilters } = req.body;
    
    if (!area || !content) {
      return res.status(400).json({
        success: false,
        error: 'Area and content are required'
      });
    }
    
    console.log(`[AdminRoutes] Agent evaluation for ${content.length} items in ${area}`);
    
    const result = await agentEvaluationService.evaluateContent({
      area,
      content,
      prompt,
      model,
      useRules: useRules !== false,
      useCorrections: useCorrections !== false,
      areaFilters: areaFilters || []  // Pass filters to agent evaluation
    });
    
    return res.json(result);
  } catch (error) {
    console.error('Error in agent evaluation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate content'
    });
  }
});

// Evaluate content with LLM (legacy)
router.post('/chat/evaluate', async (req: Request, res: Response) => {
  try {
    const { area, content, prompt, model, areaFilters } = req.body;
    
    if (!area || !content || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Area, content, and prompt are required'
      });
    }

    if (!Array.isArray(content)) {
      return res.status(400).json({
        success: false,
        error: 'Content must be an array'
      });
    }

    console.log(`[AdminRoutes] Evaluating ${content.length} items for ${area} using ${model || 'default'} model`);

    const result = await llmChatService.evaluateContent({
      area,
      content,
      prompt,
      model: model || 'gemini-1.5-flash',
      areaFilters: areaFilters || []  // Pass filters to LLM evaluation
    });

    return res.json(result);
  } catch (error) {
    console.error('Error evaluating content:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate content'
    });
  }
});

// Chat with LLM about content
router.post('/chat/message', async (req: Request, res: Response) => {
  try {
    const { area, content, message, model, conversationHistory } = req.body;
    
    if (!area || !content || !message) {
      return res.status(400).json({
        success: false,
        error: 'Area, content, and message are required'
      });
    }

    const result = await llmChatService.chatAboutContent(
      area,
      content,
      message,
      model || 'gemini-1.5-flash',
      conversationHistory || []
    );

    return res.json(result);
  } catch (error) {
    console.error('Error in chat:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process chat message'
    });
  }
});

// Debug content similarity - analyze why certain content appears frequently
router.post('/debug/content-similarity', async (req: Request, res: Response) => {
  try {
    const { contentId, query, area } = req.body;
    
    if (!contentId || !query) {
      return res.status(400).json({
        success: false,
        error: 'Content ID and query are required'
      });
    }

    console.log(`[AdminRoutes] Debugging content similarity for: ${contentId} with query: "${query}"`);

    // Get the actual content record
    const { data: contentRecord, error: contentError } = await supabase
      .from('content')
      .select('*')
      .eq('id', contentId)
      .single();

    if (contentError || !contentRecord) {
      return res.status(404).json({
        success: false,
        error: 'Content not found'
      });
    }

    // Generate embedding for the query
    const openaiHelper = new OpenAIHelper();
    const queryEmbedding = await openaiHelper.generateEmbedding(query);

    // Use the enhanced debug function from Supabase
    let analysis = null;
    try {
      const { data: debugData, error: debugError } = await supabase.rpc('debug_content_similarity', {
        content_id: contentId,
        query_text: query,
        query_embedding: queryEmbedding
      });

      if (!debugError && debugData?.[0]) {
        const debug = debugData[0];
        analysis = {
          contentScore: debug.content_similarity,
          locationScore: debug.location_similarity,
          temporalScore: debug.temporal_similarity,
          dominantFactor: getDominantFactor(debug),
          recommendation: getRecommendation(debug, query),
          embeddings: {
            hasContent: !!contentRecord.content_embedding,
            hasLocation: !!contentRecord.location_embedding,
            hasTemporal: !!contentRecord.temporal_embedding
          }
        };
      } else {
        console.warn('Enhanced debug function failed, falling back to manual calculation:', debugError?.message);
        
        // Fallback to manual calculation
        const cosineSimilarity = (a: number[], b: number[]): number => {
          if (!a || !b || a.length !== b.length) return 0;
          const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
          const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
          const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
          return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
        };

        const contentScore = contentRecord.content_embedding 
          ? cosineSimilarity(queryEmbedding, contentRecord.content_embedding) 
          : 0;
        const locationScore = contentRecord.location_embedding 
          ? cosineSimilarity(queryEmbedding, contentRecord.location_embedding) 
          : 0;
        const temporalScore = contentRecord.temporal_embedding 
          ? cosineSimilarity(queryEmbedding, contentRecord.temporal_embedding) 
          : 0;

        analysis = {
          contentScore,
          locationScore,
          temporalScore,
          dominantFactor: getDominantFactor({ 
            content_similarity: contentScore, 
            location_similarity: locationScore, 
            temporal_similarity: temporalScore 
          }),
          recommendation: getRecommendation({ 
            content_similarity: contentScore, 
            location_similarity: locationScore, 
            temporal_similarity: temporalScore 
          }, query),
          embeddings: {
            hasContent: !!contentRecord.content_embedding,
            hasLocation: !!contentRecord.location_embedding,
            hasTemporal: !!contentRecord.temporal_embedding
          }
        };
      }
    } catch (error) {
      console.error('Error using enhanced debug function:', error);
      analysis = null;
    }

    const result = {
      success: true,
      contentId,
      query,
      area,
      content: contentRecord,
      analysis,
      debug: {
        contentText: contentRecord.title + ' ' + (contentRecord.data?.description || ''),
        locationText: contentRecord.data?.original_location_text || contentRecord.data?.location || 'No location',
        temporalText: contentRecord.data?.original_date_text || contentRecord.data?.date || 'No temporal',
        embeddings: {
          content: contentRecord.content_embedding ? 'Present' : 'Missing',
          location: contentRecord.location_embedding ? 'Present' : 'Missing',
          temporal: contentRecord.temporal_embedding ? 'Present' : 'Missing'
        },
        enhancedFunctions: analysis ? 'Using enhanced SQL functions' : 'Using fallback calculation'
      }
    };

    return res.json(result);
  } catch (error) {
    console.error('Error debugging content similarity:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to debug content similarity'
    });
  }
});

// Search content with detailed scoring breakdown
router.post('/debug/search-analysis', async (req: Request, res: Response) => {
  try {
    const { query, area, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    console.log(`[AdminRoutes] Analyzing search results for: "${query}" in ${area || 'all areas'}`);

    // Generate embedding for the query
    const openaiHelper = new OpenAIHelper();
    const queryEmbedding = await openaiHelper.generateEmbedding(query);

    // Try to use the new enhanced location search function with adaptive query processing
    let searchResults, searchError;
    try {
      const { data: enhancedResults, error: enhancedError } = await supabase.rpc('search_content_enhanced_location', {
        query_text: query,
        area_filter: area || null,
        limit_count: limit
      });
      
      if (!enhancedError) {
        searchResults = enhancedResults;
        console.log(`[AdminRoutes] Using enhanced location search with adaptive query processing`);
      } else {
        throw new Error(enhancedError.message);
      }
    } catch (enhancedError) {
      console.warn('Enhanced location search failed, falling back to weighted search:', enhancedError instanceof Error ? enhancedError.message : enhancedError);
      
      // Fallback to weighted search
      try {
        const { data: weightedResults, error: weightedError } = await supabase.rpc('search_content_multi_vectors_weighted', {
          query_embedding: queryEmbedding,
          search_type: 'combined',
          match_threshold: 0.1,
          match_count: limit,
          filter_area: area || null
        });
        
        if (!weightedError) {
          searchResults = weightedResults;
          console.log(`[AdminRoutes] Using weighted search function as fallback`);
        } else {
          throw new Error(weightedError.message);
        }
      } catch (weightedError) {
        console.warn('Weighted search also failed, falling back to standard search:', weightedError instanceof Error ? weightedError.message : weightedError);
        
        // Final fallback to standard search
        const { data: standardResults, error: standardError } = await supabase.rpc('search_content_multi_vectors', {
          query_embedding: queryEmbedding,
          search_type: 'combined',
          match_threshold: 0.1,
          match_count: limit,
          filter_area: area || null
        });
        
        searchResults = standardResults;
        searchError = standardError;
      }
    }

    if (searchError) {
      console.error('Search error:', searchError);
      return res.status(500).json({
        success: false,
        error: `Search error: ${searchError.message}`
      });
    }

    // Get detailed analysis for each result by fetching full content and calculating similarities
    const detailedResults = await Promise.all(
      (searchResults || []).slice(0, 5).map(async (result: any) => {
        try {
          // Get full content record
          const { data: contentRecord } = await supabase
            .from('content')
            .select('*')
            .eq('id', result.id)
            .single();

          if (!contentRecord) {
            return { ...result, debug: null, analysis: null };
          }

          // Calculate similarity manually using cosine similarity
          const cosineSimilarity = (a: number[], b: number[]): number => {
            if (!a || !b || a.length !== b.length) return 0;
            const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
            const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
            const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
            return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
          };

          const contentScore = contentRecord.content_embedding 
            ? cosineSimilarity(queryEmbedding, contentRecord.content_embedding) 
            : 0;
          const locationScore = contentRecord.location_embedding 
            ? cosineSimilarity(queryEmbedding, contentRecord.location_embedding) 
            : 0;
          const temporalScore = contentRecord.temporal_embedding 
            ? cosineSimilarity(queryEmbedding, contentRecord.temporal_embedding) 
            : 0;

          // Use similarity scores from enhanced search function if available, otherwise calculate manually
          const enhancedContentScore = result.content_similarity ?? contentScore;
          const enhancedLocationScore = result.location_similarity ?? locationScore;
          const enhancedTemporalScore = result.temporal_similarity ?? temporalScore;
          
          const debugData = {
            content_similarity: enhancedContentScore,
            location_similarity: enhancedLocationScore,
            temporal_similarity: enhancedTemporalScore
          };

          return {
            ...result,
            debug: {
              contentText: contentRecord.title + ' ' + (contentRecord.data?.description || ''),
              locationText: contentRecord.data?.enhanced_location_text || contentRecord.data?.original_location_text || contentRecord.data?.location || 'No location',
              temporalText: contentRecord.data?.original_date_text || contentRecord.data?.date || 'No temporal',
              embeddings: {
                content: contentRecord.content_embedding ? 'Present' : 'Missing',
                location: contentRecord.location_embedding ? 'Present' : 'Missing',
                temporal: contentRecord.temporal_embedding ? 'Present' : 'Missing'
              },
              // Add new enhanced search metadata
              queryType: result.query_type || 'unknown',
              thresholds: {
                content: result.content_threshold || 'N/A',
                location: result.location_threshold || 'N/A'
              }
            },
            analysis: {
              contentScore: enhancedContentScore,
              locationScore: enhancedLocationScore,
              temporalScore: enhancedTemporalScore,
              totalSimilarity: result.total_similarity || (enhancedContentScore * 0.65 + enhancedLocationScore * 0.25 + enhancedTemporalScore * 0.10),
              dominantFactor: getDominantFactor(debugData),
              recommendation: getRecommendation(debugData, query),
              embeddings: {
                hasContent: !!contentRecord.content_embedding,
                hasLocation: !!contentRecord.location_embedding,
                hasTemporal: !!contentRecord.temporal_embedding
              },
              // Add enhanced search analysis
              queryClassification: result.query_type || 'unknown',
              adaptiveWeights: result.query_type ? 'Applied' : 'Not Applied',
              enhancedSearch: !!result.query_type
            }
          };
        } catch (err) {
          console.error(`Error debugging content ${result.id}:`, err);
          return { ...result, debug: null, analysis: null };
        }
      })
    );

    // Calculate summary statistics
    const validAnalyses = detailedResults.filter(r => r.analysis);
    const enhancedSearchUsed = detailedResults.some(r => r.analysis?.enhancedSearch);
    const queryType = detailedResults.find(r => r.debug?.queryType)?.debug?.queryType || 'unknown';
    
    const summary = validAnalyses.length > 0 ? {
      averageContentScore: validAnalyses.reduce((sum, r) => sum + (r.analysis?.contentScore || 0), 0) / validAnalyses.length,
      averageLocationScore: validAnalyses.reduce((sum, r) => sum + (r.analysis?.locationScore || 0), 0) / validAnalyses.length,
      averageTemporalScore: validAnalyses.reduce((sum, r) => sum + (r.analysis?.temporalScore || 0), 0) / validAnalyses.length,
      averageTotalSimilarity: validAnalyses.reduce((sum, r) => sum + (r.analysis?.totalSimilarity || 0), 0) / validAnalyses.length,
      locationDominatedResults: validAnalyses.filter(r => r.analysis?.dominantFactor === 'location').length,
      contentDominatedResults: validAnalyses.filter(r => r.analysis?.dominantFactor === 'content').length,
      temporalDominatedResults: validAnalyses.filter(r => r.analysis?.dominantFactor === 'temporal').length,
      missingEmbeddings: {
        content: detailedResults.filter(r => !r.analysis?.embeddings?.hasContent).length,
        location: detailedResults.filter(r => !r.analysis?.embeddings?.hasLocation).length,
        temporal: detailedResults.filter(r => !r.analysis?.embeddings?.hasTemporal).length
      },
      // Enhanced search metadata
      enhancedSearch: {
        used: enhancedSearchUsed,
        queryType: queryType,
        adaptiveWeights: enhancedSearchUsed ? 'Applied' : 'Not Applied',
        resultsWithAdaptiveWeights: validAnalyses.filter(r => r.analysis?.enhancedSearch).length
      }
    } : null;

    return res.json({
      success: true,
      query,
      area,
      totalResults: searchResults?.length || 0,
      detailedResults,
      summary
    });
  } catch (error) {
    console.error('Error analyzing search:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze search'
    });
  }
});

// Helper functions for analysis
function getDominantFactor(debug: any): string {
  const content = debug.content_similarity || 0;
  const location = debug.location_similarity || 0;
  const temporal = debug.temporal_similarity || 0;

  if (content >= location && content >= temporal) return 'content';
  if (location >= content && location >= temporal) return 'location';
  return 'temporal';
}

function getRecommendation(debug: any, query: string): string {
  const content = debug.content_similarity || 0;
  const location = debug.location_similarity || 0;
  const temporal = debug.temporal_similarity || 0;

  if (location > content + 0.1) {
    return `High location score (${location.toFixed(3)}) vs content score (${content.toFixed(3)}) - consider improving content relevance`;
  }
  if (content < 0.3) {
    return `Low content relevance (${content.toFixed(3)}) - this item may not match the query "${query}"`;
  }
  if (content > 0.7) {
    return `Strong content match (${content.toFixed(3)}) - this is a relevant result`;
  }
  return `Moderate relevance - content: ${content.toFixed(3)}, location: ${location.toFixed(3)}, temporal: ${temporal.toFixed(3)}`;
}

// Helper function to update area profile based on labeled data
async function updateAreaProfile(area: string) {
  try {
    // Get all labeled content for this area
    const collection = await firestoreService.getCollection('content');
    const labeledContent: any[] = [];
    
    collection.forEach((doc: any) => {
      const data = doc.data();
      if (data.area === area && data.labels) {
        labeledContent.push({ id: doc.id, ...data });
      }
    });

    if (labeledContent.length > 20) {
      // Generate area profile embedding based on high-quality local content
      const localContent = labeledContent
        .filter(item => 
          item.labels.scope === 'local' && 
          item.labels.quality >= 7
        )
        .slice(0, 50);

      if (localContent.length > 10) {
        const profileText = localContent
          .map(item => `${item.title} ${item.description || ''}`)
          .join(' ');

        const profileEmbedding = await embeddingService.generateEmbedding(profileText);
        
        // Store area profile
        await firestoreService.setDocument('area_profiles', area, {
          area,
          embedding: profileEmbedding,
          labeledContentCount: labeledContent.length,
          localContentCount: localContent.length,
          updatedAt: new Date().toISOString(),
          profileText: profileText.substring(0, 1000) // Store sample for debugging
        });
        
        console.log(`Updated area profile for ${area} with ${localContent.length} local items`);
      }
    }
  } catch (error) {
    console.error(`Failed to update area profile for ${area}:`, error);
  }
}

// Pattern recognition endpoints
router.post('/patterns/learn', async (req: Request, res: Response) => {
  try {
    console.log('[AdminRoutes] Learning patterns from labeled content...');
    
    await patternRecognitionService.learnFromLabeledContent();
    
    const stats = await patternRecognitionService.getPatternStats();
    
    return res.json({
      success: true,
      message: 'Successfully learned patterns from labeled content',
      stats
    });
  } catch (error) {
    console.error('Error learning patterns:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to learn patterns'
    });
  }
});

// Apply patterns to unlabeled content
router.post('/patterns/apply', async (req: Request, res: Response) => {
  try {
    console.log('[AdminRoutes] Applying cross-area patterns...');
    
    const updated = await patternRecognitionService.applyCrossAreaPatterns();
    
    return res.json({
      success: true,
      message: `Applied patterns to ${updated} unlabeled items`,
      itemsUpdated: updated
    });
  } catch (error) {
    console.error('Error applying patterns:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply patterns'
    });
  }
});

// Rules Engine endpoints
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const rules = await rulesEngineService.getAllRules();
    const stats = await rulesEngineService.getRuleStats();
    
    return res.json({
      success: true,
      rules,
      stats
    });
  } catch (error) {
    console.error('Error getting rules:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get rules'
    });
  }
});

router.post('/rules', async (req: Request, res: Response) => {
  try {
    const rule = req.body;
    
    if (!rule.name || !rule.condition || !rule.action) {
      return res.status(400).json({
        success: false,
        error: 'Rule must have name, condition, and action'
      });
    }
    
    const ruleId = await rulesEngineService.addRule(rule);
    
    return res.json({
      success: true,
      ruleId,
      message: 'Rule created successfully'
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create rule'
    });
  }
});

router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    await rulesEngineService.updateRule(id, updates);
    
    return res.json({
      success: true,
      message: 'Rule updated successfully'
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update rule'
    });
  }
});

router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await rulesEngineService.deleteRule(id);
    
    return res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete rule'
    });
  }
});

// Learn from corrections and create rules
router.post('/learn', async (req: Request, res: Response) => {
  try {
    const result = await agentEvaluationService.learnFromCorrections();
    
    return res.json({
      success: true,
      message: `Found ${result.patternsFound} patterns and created ${result.rulesCreated} rules`,
      ...result
    });
  } catch (error) {
    console.error('Error learning from corrections:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to learn from corrections'
    });
  }
});

// Get pattern statistics
router.get('/patterns/stats', async (req: Request, res: Response) => {
  try {
    const stats = await patternRecognitionService.getPatternStats();
    
    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting pattern stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pattern stats'
    });
  }
});

// Check pattern matches for specific content
router.post('/patterns/check/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    
    // Get content
    const doc = await firestoreService.getDocument('content', contentId);
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Content not found'
      });
    }
    
    const content = { id: contentId, ...doc.data() };
    
    // Check for pattern matches
    const matches = await patternRecognitionService.matchContentToPatterns(content);
    
    return res.json({
      success: true,
      contentId,
      title: content.title,
      area: content.area,
      currentLabels: content.labels || null,
      suggestedLabels: content.suggestedLabels || null,
      patternMatches: matches
    });
  } catch (error) {
    console.error('Error checking patterns:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check patterns'
    });
  }
});

// === Location Embedding Regeneration Endpoints ===

// Get regeneration statistics
router.get('/location-embeddings/stats', async (req: Request, res: Response) => {
  try {
    const { area } = req.query;
    
    const stats = await locationEmbeddingRegenerationService.getRegenerationStats(area as string);
    
    return res.json({
      success: true,
      area: area || 'all',
      stats
    });
  } catch (error) {
    console.error('Error getting regeneration stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get regeneration stats'
    });
  }
});

// Regenerate location embeddings
router.post('/location-embeddings/regenerate', async (req: Request, res: Response) => {
  try {
    const { area, batchSize = 50, dryRun = false } = req.body;
    
    console.log(`🔄 Starting location embedding regeneration: area=${area}, batchSize=${batchSize}, dryRun=${dryRun}`);
    
    const stats = await locationEmbeddingRegenerationService.regenerateAllLocationEmbeddings({
      area,
      batchSize,
      dryRun
    });
    
    return res.json({
      success: true,
      message: dryRun ? 'Dry run completed' : 'Location embeddings regenerated successfully',
      stats
    });
  } catch (error) {
    console.error('Error regenerating location embeddings:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate location embeddings'
    });
  }
});

export default router;