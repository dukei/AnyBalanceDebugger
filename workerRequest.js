function setWord(word, int8array, offset){
    Atomics.store(int8array, offset, word >> 8);
    Atomics.store(int8array, offset+1, word & 0xff);
}

function setDWord(dword, int8array, offset){
    setWord(dword >> 16, int8array, offset);
    setWord(dword & 0xffff, int8array, offset + 2);
}

function getDWord(int8array, offset){
    return (int8array[offset] << 24) + (int8array[offset+1] << 16) + (int8array[offset+2] << 8) + (int8array[offset+3])
}

function getWord(int8array, offset){
    return (int8array[offset] << 8) + int8array[offset+1];
}

function getBufferInfo() {
    return {
        currentLengthOffset: 5,
        totalLengthOffset: 1,
        serviceLength: 7
    }
}


function workerRequest(){
    let respBody = undefined;

    const {currentLengthOffset,
        totalLengthOffset,
        serviceLength} = getBufferInfo();

    function sendBody(sab, body, forceStatus){
        const int8 = new Uint8Array(sab);
        let offset = getWord(int8, currentLengthOffset);
        if(offset !== 0) //Если в первых двух байтах не 0, то это повторные разы
            offset = getDWord(int8, totalLengthOffset);
        const bufferLength = Math.min(int8.length, 65536);
        const leftToCopy = body.byteLength - offset;
        const dataBufferLength = bufferLength - serviceLength;

        const status = forceStatus || (leftToCopy <= dataBufferLength ? 1 : 2);
        const copyLength = Math.min(leftToCopy, dataBufferLength);
        setWord(copyLength, int8, currentLengthOffset);

        int8.set(new Uint8Array(body).subarray(offset, copyLength), serviceLength);
        Atomics.store(int8, 0, status);
    }

    onmessage = async (event) => {
        const data = event.data;
        const {
            type,
            sab,
            url,
            method,
            headers,
            redirect,
            body
        } = data;

        const int8 = new Uint8Array(sab);
        try {
            if (type === 'request') {

                const response = await fetch(url, {
                    method: method,
                    credentials: "include",
                    mode: "cors",
                    headers: headers,
                    cache: "no-store",
                    redirect: redirect,
                    body: body
                });

                respBody = await response.arrayBuffer();
                setDWord(respBody.byteLength, int8, totalLengthOffset);
                setWord(0, int8, currentLengthOffset);
                sendBody(sab, respBody);
            } else if (type === 'response') {
                sendBody(sab, respBody);
            }
        }catch(e){
            console.error("Error in worker fetching " + event.data.type + " " + event.data.url, e);
            let utf8Encode = new TextEncoder();
            const arr = utf8Encode.encode(e.message);
            setDWord(arr.byteLength, int8, totalLengthOffset);
            setWord(0, int8, currentLengthOffset);
            sendBody(sab, arr, 3);
        }
    }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
    workerRequest();