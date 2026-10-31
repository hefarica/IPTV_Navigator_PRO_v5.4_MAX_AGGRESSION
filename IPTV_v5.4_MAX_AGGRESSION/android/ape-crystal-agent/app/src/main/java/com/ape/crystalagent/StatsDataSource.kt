package com.ape.crystalagent

import android.net.Uri
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener

/** DataSource de paso que cuenta bytes de red/caché antes de entregarlos al parser HLS. */
class StatsDataSource(
    private val upstream: DataSource,
    private val meter: BitrateMeter
) : DataSource {
    override fun open(dataSpec: DataSpec): Long = upstream.open(dataSpec)

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val n = upstream.read(buffer, offset, length)
        if (n > 0) meter.add(n.toLong())
        return n
    }

    override fun getUri(): Uri? = upstream.uri
    override fun close() = upstream.close()
    override fun addTransferListener(listener: TransferListener) = upstream.addTransferListener(listener)

    class Factory(
        private val upstream: DataSource.Factory,
        private val meter: BitrateMeter
    ) : DataSource.Factory {
        override fun createDataSource(): DataSource = StatsDataSource(upstream.createDataSource(), meter)
    }
}
