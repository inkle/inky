-- Supabase Setup for Ink AI Assistant
-- Run this in your Supabase SQL editor

-- Enable pgvector extension
create extension if not exists vector;

-- Create documentation table
create table if not exists ink_documentation (
  id bigserial primary key,
  content text not null,
  metadata jsonb,
  embedding vector(384), -- Adjust dimension based on your embedding model
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create index for faster vector search
create index on ink_documentation using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Create function for similarity search
create or replace function match_documents (
  query_embedding vector(384),
  match_threshold float default 0.78,
  match_count int default 5
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    ink_documentation.id,
    ink_documentation.content,
    ink_documentation.metadata,
    1 - (ink_documentation.embedding <=> query_embedding) as similarity
  from ink_documentation
  where 1 - (ink_documentation.embedding <=> query_embedding) > match_threshold
  order by ink_documentation.embedding <=> query_embedding
  limit match_count;
$$;

-- Grant permissions (adjust for your auth setup)
-- For public access (development only):
-- grant usage on schema public to anon;
-- grant select on ink_documentation to anon;
-- grant execute on function match_documents to anon;

-- For authenticated users:
-- grant usage on schema public to authenticated;
-- grant all on ink_documentation to authenticated;
-- grant execute on function match_documents to authenticated;
