# Storage

This document describes every Storage bucket in the Supabase project, its
purpose, upload/delete flows, and which module uses it.

---

## Buckets Overview

| Bucket ID | Name | Public | File Size Limit | Allowed MIME Types | Used By |
|---|---|---|---|---|---|
| `avatars` | avatars | Yes | None | None | User Management (Profile page) |
| `question-images` | question-images | Yes | None | None | Question Bank |

Both buckets are **public** (anyone can read objects via the public URL) and
have **no file size limit** or **MIME type restriction** configured at the
bucket level.

---

## Bucket: avatars

### Purpose

Stores user profile avatar images. Each user has at most one avatar at the
path `{userId}/avatar.{ext}`.

### Used By

- **Module:** User Management
- **File:** `src/pages/shared/ProfilePage.tsx`

### Upload Flow

```
User selects an image file on the Profile page
        │
        ▼
ProfilePage.tsx:
        │
        ├── Extract file extension from the file name
        ├── Construct path: `${userId}/avatar.${ext}`
        ├── Upload to bucket "avatars" with upsert: true
        │   supabase.storage
        │     .from('avatars')
        │     .upload(path, file, { upsert: true, contentType: file.type })
        │
        ├── Get public URL:
        │   supabase.storage
        │     .from('avatars')
        │     .getPublicUrl(path)
        │
        ├── Call update_own_profile RPC with the public URL
        │   → UPDATE profiles SET avatar_url = public_url WHERE id = auth.uid()
        │
        ▼
Avatar uploaded and profile updated.
```

### Delete Flow

There is no explicit delete flow for avatars. When a user uploads a new avatar,
the `upsert: true` option overwrites the previous file at the same path. If the
user changes their avatar extension (e.g., from `.jpg` to `.png`), the old file
remains in storage at the old path but is no longer referenced by the profile.

### Storage Policies

| Policy | Command | Roles | Condition |
|---|---|---|---|
| `public_read_avatars` | SELECT | anon, authenticated | `bucket_id = 'avatars'` |
| `insert_own_avatar` | INSERT | authenticated | `bucket_id = 'avatars' AND foldername(name)[1] = auth.uid()` |
| `update_own_avatar` | UPDATE | authenticated | `bucket_id = 'avatars' AND foldername(name)[1] = auth.uid()` |

**Notes:**
- Read access is public (anon + authenticated). This is necessary because avatar URLs are displayed in the UI without authentication.
- Write access is restricted to the owner — the first path segment must match the user's UUID.
- There is no DELETE policy for avatars. Users cannot delete their avatar; they can only replace it.

---

## Bucket: question-images

### Purpose

Stores images attached to questions in the Question Bank. Each question can
have at most one image. Images are stored at the path
`{userId}/{timestamp}.{ext}`.

### Used By

- **Module:** Question Bank
- **File:** `src/lib/questions.ts`

### Upload Flow

```
Teacher attaches an image to a question in the Question Bank form
        │
        ▼
questions.ts (createQuestion / updateQuestion):
        │
        ├── Extract file extension
        ├── Construct path: `${userId}/${Date.now()}.${ext}`
        ├── Upload to bucket "question-images" with upsert: true
        │   supabase.storage
        │     .from('question-images')
        │     .upload(path, file, { upsert: true })
        │
        ├── Get public URL
        │   supabase.storage
        │     .from('question-images')
        │     .getPublicUrl(path)
        │
        ├── Store the public URL in questions.image_url
        │
        ▼
Image uploaded and question record updated with image_url.
```

### Delete Flow

```
Teacher deletes a question (or removes the image from a question)
        │
        ▼
questions.ts (deleteQuestion):
        │
        ├── If question has an image_url:
        │   ├── Extract the storage path from the public URL
        │   │   (parse the URL to get the path after the bucket name)
        │   └── Remove from bucket "question-images"
        │       supabase.storage
        │         .from('question-images')
        │         .remove([path])
        │
        ├── DELETE FROM questions WHERE id = ?
        │
        ▼
Image and question record deleted.
```

**Note:** When updating a question to replace an image, the old image file is
not explicitly deleted — the new image is uploaded to a new path (with a new
timestamp), and `questions.image_url` is updated. The old file remains in
storage but is no longer referenced.

### Storage Policies

| Policy | Command | Roles | Condition |
|---|---|---|---|
| `public_read_question_images` | SELECT | anon, authenticated | `bucket_id = 'question-images'` |
| `insert_own_question_image` | INSERT | authenticated | `bucket_id = 'question-images' AND foldername(name)[1] = auth.uid()` |
| `update_own_question_image` | UPDATE | authenticated | `bucket_id = 'question-images' AND foldername(name)[1] = auth.uid()` |
| `delete_own_question_image` | DELETE | authenticated | `bucket_id = 'question-images' AND foldername(name)[1] = auth.uid()` |

**Notes:**
- Read access is public. This is necessary because question images are displayed in the UI.
- Write and delete access is restricted to the owner — the first path segment must match the user's UUID.
- Unlike avatars, question images have a DELETE policy, allowing teachers to delete their own images.

---

## Security Observations

1. **Both buckets are public.** Anyone with the URL can read the files. This is
   by design (images need to be displayed in the UI without authentication),
   but it means image URLs are guessable if the path pattern is known.

2. **No file size limits.** Neither bucket has a `file_size_limit` configured.
   Users could upload arbitrarily large files.

3. **No MIME type restrictions.** Neither bucket has `allowed_mime_types`
   configured. Users could upload non-image files (e.g., executables) to either
   bucket.

4. **No bucket-level DELETE policy for avatars.** The avatars bucket has no
   DELETE storage policy, so users cannot delete their avatar — only replace it.

5. **Orphaned files.** When a user replaces an avatar or question image, the
   old file remains in storage. There is no cleanup mechanism.
