-- X's actual reply cascade: each reply is a full mini-post, and replying
-- to a specific reply (not just the post) is what creates the nested
-- "conversation under a comment" feel. Self-referencing FK, same
-- on-delete-cascade a thread's own replies already get.

alter table public.post_replies add column parent_reply_id uuid references public.post_replies(id) on delete cascade;

create index post_replies_parent_idx on public.post_replies(parent_reply_id);
