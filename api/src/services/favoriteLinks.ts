// src/services/favoriteLinks.ts
import {In, IsNull} from "typeorm";
import {initDataSource} from "@/configurations/typeorm.config";
import {VkTrack} from "@/db/entities/VkTrack";
import {FRISKY_OWNER_ID, RawVkItem} from "@/services/friskyCache";

/**
 * Which group track each of the user's favourites is a copy of — by id.
 *
 * `audio.add` puts a COPY in the user's library under a new id, and VK says
 * nothing about where it came from. The API used to find the original again by
 * artist + title, after the air month had been cut out of the title, so every
 * edition of a monthly show was the same track: October's favourite lit the
 * heart on November's upload. Now the link is a column (`vk_tracks.favorite_of`
 * on the copy's own row), written when the heart is pressed.
 *
 * Copies made before this existed — or hearted in VK itself, which never passes
 * through here — are linked once, from an EXACT match of the raw artist and
 * title VK keeps on a copy (air month, part and all) against the group's own
 * rows. A title that matches no group row, or more than one, stays unlinked:
 * the heart stays off rather than guess.
 */

const trackIdOf = (ownerId: number | string, audioId: number | string): string => `${ownerId}_${audioId}`;

/** Remember that `copy` is the user's copy of `original`. Quiet without a DB. */
export const linkFavorite = async (
  copy: {owner_id: number | string; id: number | string},
  original: {owner_id: number | string; id: number | string},
): Promise<void> => {
  const ds = await initDataSource();
  if (!ds) return;
  try {
    await ds
      .getRepository(VkTrack)
      .createQueryBuilder()
      .insert()
      .into(VkTrack)
      .values({
        trackId: trackIdOf(copy.owner_id, copy.id),
        ownerId: String(copy.owner_id),
        audioId: String(copy.id),
        favoriteOf: trackIdOf(original.owner_id, original.id),
      })
      // only the link: a copy already in the cache keeps everything else
      .orUpdate(["favorite_of"], ["track_id"])
      .execute();
  } catch (error) {
    console.error("==favorites: could not store the link:", (error as Error)?.message ?? error);
  }
};

/**
 * copy track_id -> original track_id, for the copies given (RAW, before
 * `cleanupData`). `null` when there is no DB: the caller then has no ids to go
 * by and must say so rather than pretend nothing is a favourite.
 */
export const originalsOf = async (copies: RawVkItem[]): Promise<Map<string, string> | null> => {
  const ds = await initDataSource();
  if (!ds) return null;

  const links = new Map<string, string>();
  const valid = copies.filter((item) => item?.id !== undefined && item?.owner_id !== undefined);
  if (valid.length === 0) return links;

  try {
    const repository = ds.getRepository(VkTrack);
    const ids = valid.map((item) => trackIdOf(item.owner_id!, item.id!));
    const rows = await repository.find({where: {trackId: In(ids)}, select: {trackId: true, favoriteOf: true}});
    for (const row of rows) {
      if (row.favoriteOf) links.set(row.trackId, row.favoriteOf);
    }

    // a copy that IS a group row needs no link — it is the original itself
    for (const item of valid) {
      if (Number(item.owner_id) === FRISKY_OWNER_ID) links.set(trackIdOf(item.owner_id!, item.id!), trackIdOf(item.owner_id!, item.id!));
    }

    const unlinked = valid.filter((item) => !links.has(trackIdOf(item.owner_id!, item.id!)) && item.title);
    if (unlinked.length === 0) return links;

    // the one-time backfill: exact raw artist + title against the group's rows
    const titles = [...new Set(unlinked.map((item) => item.title!))];
    const candidates = await repository.find({
      where: {ownerId: String(FRISKY_OWNER_ID), title: In(titles), favoriteOf: IsNull()},
      select: {trackId: true, artist: true, title: true},
    });
    const byWords = new Map<string, string[]>();
    for (const candidate of candidates) {
      const words = `${candidate.artist ?? ""}\u0000${candidate.title ?? ""}`;
      const bucket = byWords.get(words);
      if (bucket) bucket.push(candidate.trackId);
      else byWords.set(words, [candidate.trackId]);
    }

    const found: Array<{copy: RawVkItem; original: string}> = [];
    for (const item of unlinked) {
      const matches = byWords.get(`${item.artist ?? ""}\u0000${item.title ?? ""}`);
      if (matches?.length === 1) found.push({copy: item, original: matches[0]});
    }
    for (const {copy, original} of found) {
      links.set(trackIdOf(copy.owner_id!, copy.id!), original);
      const [ownerId, audioId] = original.split("_");
      await linkFavorite({owner_id: copy.owner_id!, id: copy.id!}, {owner_id: ownerId, id: audioId});
    }
    return links;
  } catch (error) {
    console.error("==favorites: could not read the links:", (error as Error)?.message ?? error);
    return null;
  }
};
