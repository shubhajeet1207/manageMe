import { prisma } from "@/lib/db/prisma"
import type { User } from "@prisma/client"

export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } })
}

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}

export function create(data: {
  name: string
  email: string
  hashedPassword: string
}): Promise<User> {
  return prisma.user.create({ data })
}

export function updateName(id: string, name: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { name } })
}

export function updatePassword(id: string, hashedPassword: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { hashedPassword } })
}
