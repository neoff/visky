import { vk } from '@/constants';
import passport from 'passport'
import { Strategy as VKStrategy } from "passport-vkontakte";


interface User {
    id: string;
    // add other properties if needed
}

// VK
const verifyVk = async (accessToken: string, refreshToken: string, params: any, profile: any, done: any) => {
    console.log("VKONTAKTE TOKEN STRATEGY", accessToken, refreshToken, params, profile)
    process.nextTick(function () {
              
        // To keep the example simple, the user's GitHub profile is returned to
        // represent the logged-in user.  In a typical application, you would want
        // to associate the GitHub account with a user record in your database,
        // and return that user instead.
        return done(null, profile);
      })
}
passport.use(new VKStrategy(vk, verifyVk));
passport.serializeUser(function (user, done) {
    done(null, (user as User).id);
});
passport.deserializeUser(function (id, done) {
    return done(null, id as User);
});

export default passport;