// src/db/entities/Device.ts
import {Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn} from "typeorm";
import {User} from "@/db/entities/User";

/**
 * One installation of the app.
 *
 * `id` is the same `device_id` the app persists in SecureStore and sends as
 * `x-auth-device` — it is minted at direct-grant time and is part of the signed
 * VK audio request, so it is already stable and unique per install. Reusing it
 * as the playback device id means a transfer target needs no new identity.
 *
 * `pushToken` is an ExponentPushToken. It is only ever used to WAKE a device
 * whose socket is gone; the playback command itself always travels over the
 * socket, because a background push can neither be relied upon nor start audio.
 */
@Entity({name: "devices"})
export class Device {
  @PrimaryColumn({name: "id", type: "text"})
  id!: string;

  @Index("idx_devices_user")
  @Column({name: "user_id", type: "text"})
  userId!: string;

  @ManyToOne(() => User, (user) => user.devices, {onDelete: "CASCADE"})
  @JoinColumn({name: "user_id"})
  user?: User;

  /** what the picker shows: "iPhone Bob", "Pixel 7" */
  @Column({name: "name", type: "text", nullable: true})
  name?: string | null;

  /** ios | android | web */
  @Column({name: "platform", type: "text", nullable: true})
  platform?: string | null;

  @Column({name: "app_version", type: "text", nullable: true})
  appVersion?: string | null;

  @Column({name: "push_token", type: "text", nullable: true})
  pushToken?: string | null;

  @Column({name: "last_seen", type: "timestamptz", nullable: true})
  lastSeen?: Date | null;

  @CreateDateColumn({name: "created_at", type: "timestamptz"})
  createdAt!: Date;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;
}
