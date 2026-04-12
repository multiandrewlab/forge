import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type {
  PostWithAuthor,
  FeedSort,
  FeedFilter,
  FeedContentType,
  VoteValue,
} from '@forge/shared';

export const useFeedStore = defineStore('feed', () => {
  const posts = ref<PostWithAuthor[]>([]);
  const sort = ref<FeedSort>('recent');
  const selectedPostId = ref<string | null>(null);
  const cursor = ref<string | null>(null);
  const tag = ref<string | null>(null);
  const filter = ref<FeedFilter | null>(null);
  const contentType = ref<FeedContentType | null>(null);
  const userVotes = ref<Record<string, VoteValue>>({});
  const userBookmarks = ref<Record<string, boolean>>({});

  const hasMore = computed(() => cursor.value !== null);

  function setPosts(newPosts: PostWithAuthor[]): void {
    posts.value = newPosts;
  }

  function appendPosts(newPosts: PostWithAuthor[]): void {
    posts.value = [...posts.value, ...newPosts];
  }

  function setCursor(value: string | null): void {
    cursor.value = value;
  }

  function setSort(value: FeedSort): void {
    sort.value = value;
  }

  function setFilter(value: FeedFilter | null): void {
    filter.value = value;
  }

  function setTag(value: string | null): void {
    tag.value = value;
  }

  function setContentType(value: FeedContentType | null): void {
    contentType.value = value;
  }

  function setSelectedPostId(id: string | null): void {
    selectedPostId.value = id;
  }

  function updatePostVote(postId: string, voteCount: number, userVote: VoteValue | null): void {
    const post = posts.value.find((p) => p.id === postId);
    if (post) {
      post.voteCount = voteCount;
    }
    if (userVote === null) {
      userVotes.value = Object.fromEntries(
        Object.entries(userVotes.value).filter(([key]) => key !== postId),
      );
    } else {
      userVotes.value[postId] = userVote;
    }
  }

  function setBookmark(postId: string, bookmarked: boolean): void {
    if (bookmarked) {
      userBookmarks.value[postId] = true;
    } else {
      userBookmarks.value = Object.fromEntries(
        Object.entries(userBookmarks.value).filter(([key]) => key !== postId),
      );
    }
  }

  function reset(): void {
    posts.value = [];
    sort.value = 'recent';
    selectedPostId.value = null;
    cursor.value = null;
    tag.value = null;
    filter.value = null;
    contentType.value = null;
    userVotes.value = {};
    userBookmarks.value = {};
  }

  return {
    posts,
    sort,
    selectedPostId,
    cursor,
    tag,
    filter,
    contentType,
    hasMore,
    setPosts,
    appendPosts,
    setCursor,
    setSort,
    setFilter,
    setTag,
    setContentType,
    setSelectedPostId,
    userVotes,
    userBookmarks,
    updatePostVote,
    setBookmark,
    reset,
  };
});
