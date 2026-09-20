package com.gogrameen.app.net

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/* A few strings, kept encrypted on disk.
 *
 * What goes in here is the login cookie and the name and phone it belongs to.
 * The cookie is a 30-day key to someone's account, so it cannot sit in a plain
 * SharedPreferences file where a backup, a rooted phone or a debugging cable
 * can read it.
 *
 * The key is an AES key generated INSIDE the Android Keystore. The app can ask
 * the Keystore to encrypt and decrypt with it but can never read the key
 * itself, so a copy of this file taken off the phone is useless. (That is also
 * why the file is excluded from backups in data_extraction_rules.xml.)
 *
 * Not EncryptedSharedPreferences: androidx.security-crypto is deprecated, and
 * what it does for three strings fits in this file with nothing to add to the
 * build. */
interface SecretStore {
    fun get(key: String): String?
    fun put(key: String, value: String?)
}

class KeystoreSecretStore(context: Context) : SecretStore {

    private val prefs = context.applicationContext
        .getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun get(key: String): String? {
        val stored = prefs.getString(key, null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: Exception) {
            /* The key is gone or the bytes are not ours: restored from another
               phone, the Keystore wiped by a factory reset of the lock screen, a
               half-written file. Every one of those ends the same way — forget
               it, and the person logs in again. Never a crash on launch. */
            prefs.edit().remove(key).apply()
            null
        }
    }

    override fun put(key: String, value: String?) {
        if (value == null) {
            prefs.edit().remove(key).apply()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(key, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        /* Named in data_extraction_rules.xml and backup_rules.xml. Rename it
           there too, or it quietly starts being backed up. */
        const val FILE = "gg_secure"
        const val ALIAS = "gg_session_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}

/* For the JVM tests, and for anything that runs before an Android context
 * exists. Holds everything in a map, forgets it all when the process dies. */
class MemorySecretStore : SecretStore {
    private val values = mutableMapOf<String, String>()
    override fun get(key: String): String? = values[key]
    override fun put(key: String, value: String?) {
        if (value == null) values.remove(key) else values[key] = value
    }
}
