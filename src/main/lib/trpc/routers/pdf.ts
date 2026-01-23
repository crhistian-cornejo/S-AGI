import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../../supabase/client";
import log from "electron-log";
import { TRPCError } from "@trpc/server";

/**
 * PDF Router
 *
 * Provides endpoints for the PDF tab to:
 * - List all PDFs from artifacts and chat_files
 * - Get PDF details and signed URLs
 * - Search within PDFs
 */

// PDF source type
const PdfSourceSchema = z.object({
  type: z.enum(["artifact", "chat_file"]),
  id: z.string().uuid(),
  name: z.string(),
  url: z.string().optional(),
  chatId: z.string().uuid().optional(),
  pageCount: z.number().optional(),
  pages: z
    .array(
      z.object({
        pageNumber: z.number(),
        content: z.string(),
        wordCount: z.number(),
      }),
    )
    .optional(),
  metadata: z
    .object({
      title: z.string().optional(),
      author: z.string().optional(),
      createdAt: z.string().optional(),
      fileSize: z.number().optional(),
      processingStatus: z.string().optional(),
    })
    .optional(),
});

export type PdfSourceType = z.infer<typeof PdfSourceSchema>;

export const pdfRouter = router({
  /**
   * List all PDFs for the current user
   * Combines PDFs from artifacts (type = 'pdf') and chat_files (content_type = 'application/pdf')
   */
  listAll: protectedProcedure
    .input(
      z
        .object({
          chatId: z.string().uuid().optional(), // Filter by chat if provided
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { chatId, limit = 50, offset = 0 } = input || {};

      try {
        // Fetch PDF artifacts - artifacts table has: id, chat_id, user_id, type, name, content, created_at, updated_at
        // For PDF artifacts, 'content' may contain the PDF URL or data
        let artifactsQuery = supabase
          .from("artifacts")
          .select(
            "id, chat_id, user_id, name, content, type, created_at, updated_at",
          )
          .eq("type", "pdf")
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false });

        // Filter by chat if provided
        if (chatId) {
          artifactsQuery = artifactsQuery.eq("chat_id", chatId);
        }

        const { data: artifacts, error: artifactsError } =
          await artifactsQuery.range(offset, offset + limit - 1);

        if (artifactsError) {
          log.error("[PdfRouter] Error fetching artifacts:", artifactsError);
        }

        // Fetch PDF chat_files - also check for PDF files by extension in case content_type varies
        let filesQuery = supabase
          .from("chat_files")
          .select(
            "id, chat_id, filename, storage_path, file_size, pages, metadata, processing_status, created_at, content_type",
          )
          .eq("user_id", ctx.userId)
          .or("content_type.eq.application/pdf,content_type.ilike.%pdf%,filename.ilike.%.pdf")
          .order("created_at", { ascending: false });

        if (chatId) {
          filesQuery = filesQuery.eq("chat_id", chatId);
        }

        const { data: chatFiles, error: filesError } = await filesQuery.range(
          offset,
          offset + limit - 1,
        );

        if (filesError) {
          log.error("[PdfRouter] Error fetching chat_files:", filesError);
        }

        log.info("[PdfRouter] listAll query results:", {
          userId: ctx.userId,
          chatId,
          artifactsCount: artifacts?.length || 0,
          chatFilesCount: chatFiles?.length || 0,
          artifactsError: artifactsError?.message,
          filesError: filesError?.message,
        });

        // Transform artifacts to PdfSource format
        // For PDF artifacts, the 'content' field may contain a URL or JSON with PDF data
        const artifactPdfs: PdfSourceType[] = (artifacts || []).map(
          (artifact) => {
            // Try to extract URL from content - it might be a direct URL or JSON
            let pdfUrl: string | undefined;
            try {
              if (artifact.content) {
                if (artifact.content.startsWith("http")) {
                  pdfUrl = artifact.content;
                } else {
                  const parsed = JSON.parse(artifact.content);
                  pdfUrl = parsed.url || parsed.pdf_url;
                }
              }
            } catch {
              // Content is not JSON, use as-is if it looks like a URL
              if (artifact.content?.startsWith("http")) {
                pdfUrl = artifact.content;
              }
            }

            return {
              type: "artifact" as const,
              id: artifact.id,
              name: artifact.name,
              url: pdfUrl,
              chatId: artifact.chat_id || undefined,
              metadata: {
                createdAt: artifact.created_at,
              },
            };
          },
        );

        // Transform chat_files to PdfSource format
        const chatFilePdfs: PdfSourceType[] = (chatFiles || []).map((file) => ({
          type: "chat_file" as const,
          id: file.id,
          name: file.filename,
          chatId: file.chat_id,
          pageCount: file.pages?.length || undefined,
          pages: file.pages || undefined,
          metadata: {
            title: file.metadata?.title as string | undefined,
            fileSize: file.file_size || undefined,
            createdAt: file.created_at,
            processingStatus: file.processing_status,
          },
        }));

        // Combine and sort by creation date
        const allPdfs = [...artifactPdfs, ...chatFilePdfs].sort((a, b) => {
          const dateA = new Date(a.metadata?.createdAt || 0);
          const dateB = new Date(b.metadata?.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });

        return {
          pdfs: allPdfs,
          total: allPdfs.length,
          hasMore: allPdfs.length === limit,
        };
      } catch (error) {
        log.error("[PdfRouter] listAll error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list PDFs",
        });
      }
    }),

  /**
   * Get a signed URL for a chat_file PDF
   */
  getSignedUrl: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        expiresIn: z.number().min(60).max(86400).default(3600), // 1 hour default, max 24 hours
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        // Get the file record
        const { data: file, error: fileError } = await supabase
          .from("chat_files")
          .select("id, storage_path, user_id")
          .eq("id", input.fileId)
          .eq("user_id", ctx.userId)
          .single();

        if (fileError || !file) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "PDF file not found",
          });
        }

        // Generate signed URL
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("attachments")
          .createSignedUrl(file.storage_path, input.expiresIn);

        if (urlError || !signedUrlData) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate signed URL",
          });
        }

        return {
          url: signedUrlData.signedUrl,
          expiresAt: new Date(
            Date.now() + input.expiresIn * 1000,
          ).toISOString(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        log.error("[PdfRouter] getSignedUrl error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get signed URL",
        });
      }
    }),

  /**
   * Get PDF details by ID
   */
  getDetails: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        type: z.enum(["artifact", "chat_file"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        if (input.type === "artifact") {
          const { data: artifact, error } = await supabase
            .from("artifacts")
            .select("*")
            .eq("id", input.id)
            .eq("type", "pdf")
            .single();

          if (error || !artifact) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "PDF artifact not found",
            });
          }

          return {
            type: "artifact" as const,
            id: artifact.id,
            name: artifact.name,
            url: artifact.pdf_url,
            chatId: artifact.chat_id,
            pageCount: artifact.pdf_page_count,
            metadata: {
              createdAt: artifact.created_at,
            },
          };
        }

        // chat_file type
        const { data: file, error } = await supabase
          .from("chat_files")
          .select("*")
          .eq("id", input.id)
          .eq("user_id", ctx.userId)
          .single();

        if (error || !file) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "PDF file not found",
          });
        }

        // Get signed URL
        const { data: signedUrlData } = await supabase.storage
          .from("attachments")
          .createSignedUrl(file.storage_path, 3600);

        return {
          type: "chat_file" as const,
          id: file.id,
          name: file.filename,
          url: signedUrlData?.signedUrl,
          chatId: file.chat_id,
          pageCount: file.pages?.length,
          pages: file.pages,
          metadata: {
            title: file.metadata?.title,
            fileSize: file.file_size,
            createdAt: file.created_at,
            processingStatus: file.processing_status,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        log.error("[PdfRouter] getDetails error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get PDF details",
        });
      }
    }),

  /**
   * Search within a PDF's extracted content
   */
  searchInPdf: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        query: z.string().min(1).max(500),
        maxResults: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        // Get the file with extracted content
        const { data: file, error } = await supabase
          .from("chat_files")
          .select("id, filename, pages, extracted_content")
          .eq("id", input.fileId)
          .eq("user_id", ctx.userId)
          .single();

        if (error || !file) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "PDF file not found",
          });
        }

        if (!file.pages || file.pages.length === 0) {
          return {
            results: [],
            message: "No extracted content available for search",
          };
        }

        // Simple search implementation
        const queryLower = input.query.toLowerCase();
        const results: Array<{
          pageNumber: number;
          content: string;
          matchIndex: number;
        }> = [];

        for (const page of file.pages) {
          const contentLower = page.content.toLowerCase();
          let searchIndex = 0;

          while (results.length < input.maxResults) {
            const matchIndex = contentLower.indexOf(queryLower, searchIndex);
            if (matchIndex === -1) break;

            // Extract context around match (100 chars before and after)
            const start = Math.max(0, matchIndex - 100);
            const end = Math.min(
              page.content.length,
              matchIndex + input.query.length + 100,
            );
            const context = page.content.slice(start, end);

            results.push({
              pageNumber: page.pageNumber,
              content:
                (start > 0 ? "..." : "") +
                context +
                (end < page.content.length ? "..." : ""),
              matchIndex,
            });

            searchIndex = matchIndex + 1;
          }

          if (results.length >= input.maxResults) break;
        }

        return {
          results,
          totalMatches: results.length,
          filename: file.filename,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        log.error("[PdfRouter] searchInPdf error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search PDF",
        });
      }
    }),

  /**
   * Find a PDF by filename (for citation navigation)
   */
  findByFilename: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        chatId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        // Search in chat_files first (more likely for citations)
        let query = supabase
          .from("chat_files")
          .select(
            "id, chat_id, filename, storage_path, pages, metadata, processing_status",
          )
          .eq("user_id", ctx.userId)
          .ilike("filename", input.filename);

        if (input.chatId) {
          query = query.eq("chat_id", input.chatId);
        }

        const { data: files } = await query.limit(1);

        if (files && files.length > 0) {
          const file = files[0];

          // Get signed URL
          const { data: signedUrlData } = await supabase.storage
            .from("attachments")
            .createSignedUrl(file.storage_path, 3600);

          return {
            found: true,
            type: "chat_file" as const,
            id: file.id,
            name: file.filename,
            url: signedUrlData?.signedUrl,
            chatId: file.chat_id,
            pageCount: file.pages?.length,
            pages: file.pages,
          };
        }

        // Search in artifacts
        let artifactQuery = supabase
          .from("artifacts")
          .select("id, chat_id, name, pdf_url, pdf_page_count")
          .eq("type", "pdf")
          .ilike("name", input.filename);

        if (input.chatId) {
          artifactQuery = artifactQuery.eq("chat_id", input.chatId);
        }

        const { data: artifacts } = await artifactQuery.limit(1);

        if (artifacts && artifacts.length > 0) {
          const artifact = artifacts[0];
          return {
            found: true,
            type: "artifact" as const,
            id: artifact.id,
            name: artifact.name,
            url: artifact.pdf_url,
            chatId: artifact.chat_id,
            pageCount: artifact.pdf_page_count,
          };
        }

        return { found: false };
      } catch (error) {
        log.error("[PdfRouter] findByFilename error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to find PDF",
        });
      }
    }),

  /**
   * Query a PDF with AI (Q&A about the document)
   */
  queryPdf: protectedProcedure
    .input(
      z.object({
        pdfId: z.string().uuid(),
        sourceType: z.enum(["artifact", "chat_file"]),
        query: z.string().min(1).max(2000),
        context: z
          .object({
            currentPage: z.number().optional(),
            selectedText: z.string().optional(),
            pageCount: z.number().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        let documentContent = "";
        let documentName = "";

        if (input.sourceType === "chat_file") {
          // Get the chat_file with extracted content
          const { data: file, error } = await supabase
            .from("chat_files")
            .select("id, filename, pages, extracted_content")
            .eq("id", input.pdfId)
            .eq("user_id", ctx.userId)
            .single();

          if (error || !file) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "PDF file not found",
            });
          }

          documentName = file.filename;

          // Use extracted pages for context
          if (file.pages && file.pages.length > 0) {
            // If there's a current page, prioritize content around it
            if (input.context?.currentPage) {
              const currentIdx = input.context.currentPage - 1;
              const startIdx = Math.max(0, currentIdx - 1);
              const endIdx = Math.min(file.pages.length, currentIdx + 2);

              documentContent = file.pages
                .slice(startIdx, endIdx)
                .map(
                  (p: { pageNumber: number; content: string }) =>
                    `[Page ${p.pageNumber}]\n${p.content}`,
                )
                .join("\n\n");
            } else {
              // Use all pages (limited to avoid token overflow)
              const maxPages = 10;
              documentContent = file.pages
                .slice(0, maxPages)
                .map(
                  (p: { pageNumber: number; content: string }) =>
                    `[Page ${p.pageNumber}]\n${p.content}`,
                )
                .join("\n\n");

              if (file.pages.length > maxPages) {
                documentContent += `\n\n[... ${file.pages.length - maxPages} more pages not shown ...]`;
              }
            }
          } else if (file.extracted_content) {
            documentContent = file.extracted_content;
          }
        } else {
          // Artifact type - we don't have extracted content for artifacts yet
          const { data: artifact, error } = await supabase
            .from("artifacts")
            .select("id, name")
            .eq("id", input.pdfId)
            .eq("type", "pdf")
            .single();

          if (error || !artifact) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "PDF artifact not found",
            });
          }

          documentName = artifact.name;
          documentContent =
            "(Content extraction not available for PDF artifacts)";
        }

        // Use OpenAI for the response (simplified - in production would use the AI service)
        // For now, return a helpful message about the limitation
        // TODO: Integrate with the existing AI router for proper responses

        // Simple response for now - will be enhanced with actual AI integration
        const answer = documentContent
          ? `Based on the document "${documentName}":\n\nI can see the document content. Here's what I found relevant to your question about "${input.query}":\n\nThe document contains ${input.context?.pageCount || "several"} pages of content. ${
              input.context?.currentPage
                ? `You're currently viewing page ${input.context.currentPage}.`
                : ""
            }\n\n*Note: Full AI-powered responses will be available in the next update. For now, use the main chat with the PDF attached for detailed questions.*`
          : `I couldn't find extracted content for this PDF. Please try uploading the PDF to a chat for full AI analysis capabilities.`;

        return {
          answer,
          citations: [] as Array<{ pageNumber: number; text: string }>,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        log.error("[PdfRouter] queryPdf error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to query PDF",
        });
      }
    }),

  /**
   * Save PDF with annotations
   * Uploads the modified PDF with embedded annotations back to storage
   */
  saveWithAnnotations: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["artifact", "chat_file", "local"]),
        pdfData: z.string(), // Base64 encoded PDF data
        localPath: z.string().optional(), // For local files
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Decode base64 PDF data
        const pdfBuffer = Buffer.from(input.pdfData, "base64");

        if (input.type === "local" && input.localPath) {
          // Save to local file system
          const fs = await import("fs/promises");
          await fs.writeFile(input.localPath, pdfBuffer);
          log.info(`[PdfRouter] Saved PDF to local file: ${input.localPath}`);
          return { success: true };
        }

        if (input.type === "chat_file") {
          // Get file record to find storage path
          const { data: file, error: fileError } = await supabase
            .from("chat_files")
            .select("storage_path, user_id")
            .eq("id", input.id)
            .eq("user_id", ctx.userId)
            .single();

          if (fileError || !file) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "PDF file not found",
            });
          }

          // Upload to Supabase storage (attachments bucket)
          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(file.storage_path, pdfBuffer, {
              cacheControl: "3600",
              upsert: true, // Overwrite existing
              contentType: "application/pdf",
            });

          if (uploadError) {
            log.error("[PdfRouter] Upload error:", uploadError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to upload PDF",
            });
          }

          log.info(`[PdfRouter] Saved PDF to storage: ${file.storage_path}`);
          return { success: true };
        }

        if (input.type === "artifact") {
          // For artifacts, upload to a dedicated bucket or update the artifact record
          const storagePath = `artifacts/${input.id}.pdf`;

          const { error: uploadError } = await supabase.storage
            .from("artifacts")
            .upload(storagePath, pdfBuffer, {
              cacheControl: "3600",
              upsert: true,
              contentType: "application/pdf",
            });

          if (uploadError) {
            log.error("[PdfRouter] Upload error:", uploadError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to upload PDF",
            });
          }

          // Update artifact record with new URL
          const { data: urlData } = await supabase.storage
            .from("artifacts")
            .getPublicUrl(storagePath);

          if (urlData) {
            await supabase
              .from("artifacts")
              .update({ pdf_url: urlData.publicUrl, updated_at: new Date().toISOString() })
              .eq("id", input.id)
              .eq("user_id", ctx.userId);
          }

          log.info(`[PdfRouter] Saved artifact PDF: ${storagePath}`);
          return { success: true };
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid PDF type",
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        log.error("[PdfRouter] saveWithAnnotations error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save PDF",
        });
      }
    }),
});
