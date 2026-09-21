export async function reconcileSubmission<T>(
  submit: () => Promise<T>,
  lookup: () => Promise<T | undefined>,
  uncertain: (error: unknown) => boolean,
): Promise<T> {
  try {
    return await submit()
  } catch (error) {
    if (!uncertain(error)) throw error
    const accepted = await lookup().catch(() => undefined)
    if (accepted) return accepted
    throw error
  }
}
