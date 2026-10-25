/* Exercise the zlib objects embedded by the normal installed stdx FFI archive.
 * Compile with the headers from its private zlib installation, not system zlib.
 * The invalid-distance stream is from pinned zlib test/infcover.c. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "zlib.h"

#define CHECK(expr) do { \
    int ok = !!(expr); \
    printf("ZLIB_ASSERT %s %d\n", #expr, ok); \
    if (!ok) return 1; \
} while (0)

static unsigned no_input(void *desc, z_const unsigned char **buf)
{
    (void)desc;
    (void)buf;
    return 0;
}

static int discard_output(void *desc, unsigned char *buf, unsigned len)
{
    (void)desc;
    (void)buf;
    (void)len;
    return 0;
}

int main(void)
{
    const unsigned char plain[] = "stdx fixed zlib compression consumer";
    unsigned char packed[128], restored[128];
    z_size_t packed_len = sizeof(packed), restored_len = sizeof(restored);
    z_stream stream = {0};
    unsigned char window[32768];
    unsigned char invalid[] = {0x0c,0xc0,0x81,0,0,0,0,0,0x90,0xff,0x6b,4,0};
    unsigned char empty[] = {3,0};

    CHECK(strcmp(ZLIB_VERSION, "1.3.2") == 0);
    CHECK(strcmp(zlibVersion(), ZLIB_VERSION) == 0);
    CHECK(compress2_z(packed, &packed_len, plain, sizeof(plain), Z_BEST_COMPRESSION) == Z_OK);
    CHECK(uncompress_z(restored, &restored_len, packed, packed_len) == Z_OK);
    CHECK(restored_len == sizeof(plain) && memcmp(restored, plain, sizeof(plain)) == 0);
    CHECK(compressBound_z((z_size_t)-1) == (z_size_t)-1);
    CHECK(deflateBound_z(NULL, (z_size_t)-1) == (z_size_t)-1);
    CHECK(crc32_combine_gen64(-1) == 0);
    CHECK(crc32_combine64(1, 2, -1) == 0);
    CHECK(compress2_z(NULL, NULL, plain, sizeof(plain), 6) == Z_STREAM_ERROR);
    CHECK(uncompress2_z(NULL, NULL, packed, NULL) == Z_STREAM_ERROR);

    CHECK(inflateBackInit(&stream, 15, window) == Z_OK);
    stream.next_in = empty;
    stream.avail_in = sizeof(empty);
    CHECK(inflateBack(&stream, no_input, NULL, discard_output, NULL) == Z_STREAM_END);
    CHECK(inflateBackEnd(&stream) == Z_OK);
    memset(&stream, 0, sizeof(stream));
    CHECK(inflateBackInit(&stream, 15, window) == Z_OK);
    stream.next_in = invalid;
    stream.avail_in = sizeof(invalid);
    CHECK(inflateBack(&stream, no_input, NULL, discard_output, NULL) == Z_DATA_ERROR);
    CHECK(stream.msg != NULL && strcmp(stream.msg, "invalid distance too far back") == 0);
    CHECK(inflateBackEnd(&stream) == Z_OK);
    puts("STDX_INSTALLED_ZLIB_NATIVE_PASS");
    return 0;
}
