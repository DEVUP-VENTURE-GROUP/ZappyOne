package expo.modules.zappynative

import android.content.Context
import android.net.Uri
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

// A photo upload Android finishes on its own: waits for internet, retries with growing gaps, carries on with the app closed. It needs no sign-in: the presigned link is the permission.
class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val path = inputData.getString("path") ?: return Result.failure()
    val url = inputData.getString("url") ?: return Result.failure()
    val type = inputData.getString("type") ?: "image/jpeg"
    val file = File(path)
    if (!file.exists()) return Result.failure()
    return try {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "PUT"; doOutput = true; connectTimeout = 30_000; readTimeout = 120_000
        setRequestProperty("Content-Type", type)
        setFixedLengthStreamingMode(file.length())
      }
      file.inputStream().use { input -> conn.outputStream.use { input.copyTo(it) } }
      val code = conn.responseCode
      conn.disconnect()
      when {
        code in 200..299 -> { file.delete(); Result.success() }
        // The link ran out or was refused: trying again cannot fix it; the app asks for a new photo next time.
        code in 400..499 -> { file.delete(); Result.failure() }
        else -> if (runAttemptCount < MAX_TRIES) Result.retry() else Result.failure()
      }
    } catch (_: IOException) {
      if (runAttemptCount < MAX_TRIES) Result.retry() else { file.delete(); Result.failure() }
    }
  }

  companion object {
    private const val MAX_TRIES = 12

    fun enqueue(context: Context, id: String, fileUri: String, url: String, type: String): Boolean {
      val source = File(Uri.parse(fileUri).path ?: return false)
      if (!source.exists()) return false
      // Our own copy: the picker's file can live in a cache the phone clears.
      val dir = File(context.filesDir, "zappy-uploads").apply { mkdirs() }
      val copy = File(dir, id.replace(Regex("[^A-Za-z0-9_-]"), "_"))
      source.copyTo(copy, overwrite = true)
      val work = OneTimeWorkRequestBuilder<UploadWorker>()
        .setInputData(Data.Builder().putString("path", copy.absolutePath).putString("url", url).putString("type", type).build())
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .addTag("zappy-upload")
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork("zappy-upload-$id", ExistingWorkPolicy.REPLACE, work)
      return true
    }
  }
}
