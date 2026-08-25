// src/db/entities/User.ts
import {Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn} from "typeorm";
import {Device} from "@/db/entities/Device";

/**
 * A VK account. `id` is VK's own user id (a string everywhere in this codebase,
 * because that is how it arrives in the `x-auth-user` header), which is also the
 * key of the user's playback state in Kafka.
 */
@Entity({name: "users"})
export class User {
  @PrimaryColumn({name: "id", type: "text"})
  id!: string;

  @Column({name: "display_name", type: "text", nullable: true})
  displayName?: string | null;

  @CreateDateColumn({name: "created_at", type: "timestamptz"})
  createdAt!: Date;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;

  @OneToMany(() => Device, (device) => device.user)
  devices!: Device[];
}
