#define _GNU_SOURCE
#include <dlfcn.h>
#include <openssl/evp.h>
#include <openssl/x509.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

/* Private dependency replacement selected by the existing STDX OpenSSL path.
 * Every unaffected operation is delegated to the system OpenSSL. No product
 * entry point or conditional compilation is added to stdx. */
static void *real_crypto;
static int failure_mode, init_calls, reset_failures, failed_frees, duplicate_frees;
static EVP_MD_CTX *failed_ctx;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static void *real(const char *name) {
    if (!real_crypto) real_crypto = dlopen("libcrypto.so.3", RTLD_NOW | RTLD_LOCAL);
    void *f = dlsym(real_crypto, name);
    if (!f) { fprintf(stderr, "PROBE_SETUP_MISSING %s\n", name); _Exit(90); }
    return f;
}
void probe_mode(int mode) { failure_mode = mode; }
int probe_reset_failures(void) { return reset_failures; }
int probe_failed_frees(void) { return failed_frees; }
int probe_duplicate_frees(void) { return duplicate_frees; }
int i2d_X509(const X509 *cert, unsigned char **out) {
    int (*f)(const X509 *, unsigned char **) = real("i2d_X509");
    if (failure_mode == 1 && out) { fprintf(stderr,"TARGET_C_CERT_NEGATIVE_WRITE=-1\n"); return -1; }
    int n = f(cert, out);
    if (failure_mode == 2 && out) { fprintf(stderr,"TARGET_C_CERT_WRITE_LENGTH=%d reported=%d\n", n,n-1); return n-1; }
    return n;
}
int i2d_X509_REQ(const X509_REQ *req, unsigned char **out) {
    int (*f)(const X509_REQ *, unsigned char **) = real("i2d_X509_REQ");
    if (failure_mode == 3 && out) { fprintf(stderr,"TARGET_C_CSR_NEGATIVE_WRITE=-1\n"); return -1; }
    int n = f(req, out);
    if (failure_mode == 4 && out) { fprintf(stderr,"TARGET_C_CSR_WRITE_LENGTH=%d reported=%d\n", n,n-1); return n-1; }
    return n;
}
int X509_REQ_set_pubkey(X509_REQ *req, EVP_PKEY *key) {
    int (*f)(X509_REQ *, EVP_PKEY *) = real("X509_REQ_set_pubkey");
    int n = f(req, key);
    if (failure_mode == 5) { fprintf(stderr,"TARGET_C_CSR_SETPUBKEY=-1 actual=%d\n",n); return -1; }
    return n;
}
EVP_MD_CTX *EVP_MD_CTX_new(void) {
    EVP_MD_CTX *(*f)(void) = real("EVP_MD_CTX_new");
    EVP_MD_CTX *ctx = f();
    fprintf(stderr,"CTX_NEW %p\n", (void *)ctx);
    return ctx;
}
int EVP_DigestInit_ex(EVP_MD_CTX *ctx, const EVP_MD *type, ENGINE *impl) {
    int (*f)(EVP_MD_CTX *, const EVP_MD *, ENGINE *) = real("EVP_DigestInit_ex");
    init_calls++;
    if (failure_mode == 6) {
        pthread_mutex_lock(&lock);
        failed_ctx = ctx; reset_failures++; failure_mode = 0;
        pthread_mutex_unlock(&lock);
        fprintf(stderr,"TARGET_RESET_INIT_FAILURE %p call=%d\n",(void *)ctx,init_calls);
        return 0;
    }
    return f(ctx,type,impl);
}
void EVP_MD_CTX_free(EVP_MD_CTX *ctx) {
    void (*f)(EVP_MD_CTX *) = real("EVP_MD_CTX_free");
    pthread_mutex_lock(&lock);
    if (ctx && ctx == failed_ctx) {
        failed_frees++;
        if (failed_frees > 1) {
            duplicate_frees++;
            fprintf(stderr,"TARGET_DUPLICATE_FREE %p count=%d\n",(void *)ctx,failed_frees);
            pthread_mutex_unlock(&lock);
            return; /* Observe the second real-product free attempt without corrupting the allocator. */
        }
    }
    pthread_mutex_unlock(&lock);
    fprintf(stderr,"CTX_FREE %p\n",(void *)ctx);
    f(ctx);
}
