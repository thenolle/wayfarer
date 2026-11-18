/** @jsxImportSource @gambrel/view */
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@gambrel/components'
import { Download, LogIn } from '@gambrel/icons'
import type { LoaderData, PageProps, ParamsOf } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import { Flash } from '../../components/chrome'
import type { loader } from './page.server'

export default function LoginPage(props: PageProps<ParamsOf<'/login'>, LoaderData<typeof loader>>): Child {
  const { data } = props
  if ('csrf' in data === false) return null
  return (
    <div class="shell narrow">
      <main class="content">
        <Card>
          <CardHeader>
            <CardTitle class="login-title"><Download size={22} /> Wayfarer</CardTitle>
            <CardDescription>Enter the access token to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Flash flash={data.flash} />
            <form class="form-stack" method="post" action="/actions/login">
              <input type="hidden" name="csrf" value={data.csrf} />
              <Label for="token">Access token</Label>
              <Input id="token" name="token" type="password" autocomplete="current-password" required />
              <Button type="submit"><LogIn size={16} /> Sign in</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
