import * as userRepository from "@/server/repositories/user-repository"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import type { User } from "@prisma/client"

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("An account with this email already exists")
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super("Current password is incorrect")
  }
}

export async function createUser(input: {
  name: string
  email: string
  password: string
}): Promise<User> {
  const existing = await userRepository.findByEmail(input.email)
  if (existing) throw new EmailAlreadyExistsError()

  const hashedPassword = await hashPassword(input.password)
  return userRepository.create({
    name: input.name,
    email: input.email,
    hashedPassword,
  })
}

export async function verifyCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const user = await userRepository.findByEmail(email)
  if (!user) return null

  const valid = await verifyPassword(password, user.hashedPassword)
  if (!valid) return null

  return user
}

export async function updateProfile(userId: string, name: string): Promise<User> {
  return userRepository.updateName(userId, name)
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<User> {
  const user = await userRepository.findById(userId)
  if (!user) throw new Error("User not found")

  const valid = await verifyPassword(currentPassword, user.hashedPassword)
  if (!valid) throw new InvalidCurrentPasswordError()

  const hashedPassword = await hashPassword(newPassword)
  return userRepository.updatePassword(userId, hashedPassword)
}
